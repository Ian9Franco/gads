import { auditWindow, inRange } from "@/lib/dates";
import type { GoogleAdsClient } from "@/lib/google-ads/client";
import type {
  AdAudit,
  AuditAccount,
  CampaignAudit,
  KeywordAudit,
  PeriodMetrics,
  SearchTermAudit,
} from "@/lib/audit/types";
import { EMPTY_METRICS } from "@/lib/audit/types";

type Row = Record<string, unknown>;

export async function loadAuditAccount(
  client: GoogleAdsClient,
  account: {
    externalId: string;
    name: string;
    currencyCode: string;
    timeZone: string;
    loginCustomerId: string | null;
  },
  now = new Date(),
): Promise<{ account: AuditAccount; notes: string[] }> {
  const period = auditWindow(now, account.timeZone);
  const range = `segments.date BETWEEN '${period.previousStart}' AND '${period.recentEnd}'`;
  const login = account.loginCustomerId;
  const notes: string[] = [];

  const campaignRows = await client.search(
    account.externalId,
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM campaign WHERE ${range} AND campaign.status != 'REMOVED'`,
    login,
  );
  const lostRows = await optionalSearch(
    client,
    account.externalId,
    `SELECT campaign.id, segments.date, metrics.impressions, metrics.search_budget_lost_impression_share FROM campaign WHERE ${range} AND campaign.advertising_channel_type = 'SEARCH' AND campaign.status != 'REMOVED'`,
    login,
    notes,
    "impresiones perdidas por presupuesto",
  );

  const keywords = await optionalSearch(
    client,
    account.externalId,
    `SELECT ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, campaign.name, ad_group.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${range} AND ad_group_criterion.status != 'REMOVED' AND metrics.cost_micros > 0`,
    login,
    notes,
    "palabras clave",
  );
  const searchTerms = await optionalSearch(
    client,
    account.externalId,
    `SELECT search_term_view.search_term, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${range} AND metrics.cost_micros > 0`,
    login,
    notes,
    "términos de búsqueda",
  );
  const ads = await optionalSearch(
    client,
    account.externalId,
    `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, campaign.name, ad_group.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE ${range} AND ad_group_ad.status != 'REMOVED' AND metrics.impressions > 0`,
    login,
    notes,
    "anuncios",
  );
  const conversions = await optionalSearch(
    client,
    account.externalId,
    `SELECT conversion_action.id, conversion_action.status FROM conversion_action WHERE conversion_action.status = 'ENABLED'`,
    login,
    notes,
    "conversiones",
  );
  const disapproved = await optionalSearch(
    client,
    account.externalId,
    `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, campaign.name, ad_group.name FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND ad_group_ad.policy_summary.approval_status = 'DISAPPROVED'`,
    login,
    notes,
    "anuncios rechazados",
  );
  const recommendations = await optionalSearch(
    client,
    account.externalId,
    `SELECT recommendation.type, campaign.name FROM recommendation`,
    login,
    notes,
    "recomendaciones",
  );

  return {
    notes,
    account: {
      customerId: account.externalId,
      name: account.name,
      currencyCode: account.currencyCode,
      period,
      conversionActionsEnabled: conversions.length,
      campaigns: withSearchBudgetLoss(aggregateCampaigns(campaignRows, period), lostRows, period),
      keywords: aggregateKeywords(keywords, period),
      searchTerms: aggregateSearchTerms(searchTerms, period),
      ads: mergeDisapproved(aggregateAds(ads, period), disapproved),
      googleRecommendations: recommendations.map((row) => ({
        type: str(obj(row.recommendation).type) || "UNKNOWN",
        campaignName: str(obj(row.campaign).name) || undefined,
      })),
    },
  };
}

async function optionalSearch(
  client: GoogleAdsClient,
  customerId: string,
  query: string,
  loginCustomerId: string | null,
  notes: string[],
  label: string,
): Promise<Row[]> {
  try {
    return await client.search(customerId, query, loginCustomerId);
  } catch (error) {
    notes.push(`No se pudieron leer ${label}: ${error instanceof Error ? error.message : "error desconocido"}`);
    return [];
  }
}

function aggregateCampaigns(rows: Row[], period: AuditAccount["period"]): CampaignAudit[] {
  const map = new Map<string, CampaignAudit>();
  for (const row of rows) {
    const campaign = obj(row.campaign);
    const id = str(campaign.id);
    if (!id) continue;
    const current =
      map.get(id) ??
      {
        id,
        name: str(campaign.name) || id,
        status: str(campaign.status) || "UNKNOWN",
        channel: str(campaign.advertisingChannelType) || "",
        recent: empty(),
        previous: empty(),
        searchBudgetLostImpressionShare: null,
      };
    addInto(current, str(obj(row.segments).date), period, readMetrics(row));
    map.set(id, current);
  }
  return [...map.values()];
}

function withSearchBudgetLoss(campaigns: CampaignAudit[], rows: Row[], period: AuditAccount["period"]): CampaignAudit[] {
  const weight = new Map<string, { lost: number; impressions: number }>();
  for (const row of rows) {
    const id = str(obj(row.campaign).id);
    const date = str(obj(row.segments).date);
    const impressions = num(obj(row.metrics).impressions);
    const lost = num(obj(row.metrics).searchBudgetLostImpressionShare);
    if (!id || !inRange(date, period.recentStart, period.recentEnd) || impressions <= 0) continue;
    const current = weight.get(id) ?? { lost: 0, impressions: 0 };
    current.lost += lost * impressions;
    current.impressions += impressions;
    weight.set(id, current);
  }
  return campaigns.map((campaign) => {
    const totals = weight.get(campaign.id);
    if (!totals || totals.impressions <= 0) return campaign;
    return { ...campaign, searchBudgetLostImpressionShare: totals.lost / totals.impressions };
  });
}

function aggregateKeywords(rows: Row[], period: AuditAccount["period"]): KeywordAudit[] {
  const map = new Map<string, KeywordAudit>();
  for (const row of rows) {
    const criterion = obj(row.adGroupCriterion);
    const criterionId = str(criterion.criterionId);
    const adGroupId = str(obj(row.adGroup).id);
    if (!criterionId) continue;
    const id = `${adGroupId}:${criterionId}`;
    const keyword = obj(criterion.keyword);
    const current =
      map.get(id) ??
      {
        id,
        text: str(keyword.text) || criterionId,
        matchType: str(keyword.matchType) || "",
        campaignName: str(obj(row.campaign).name),
        adGroupName: str(obj(row.adGroup).name),
        status: str(criterion.status) || "",
        recent: empty(),
      };
    const date = str(obj(row.segments).date);
    if (date && inRange(date, period.recentStart, period.recentEnd)) {
      add(current.recent, readMetrics(row));
    }
    map.set(id, current);
  }
  return [...map.values()];
}

function mergeDisapproved(ads: AdAudit[], rows: Row[]): AdAudit[] {
  const map = new Map(ads.map((ad) => [ad.id, { ...ad }]));
  for (const row of rows) {
    const groupAd = obj(row.adGroupAd);
    const id = str(obj(groupAd.ad).id);
    if (!id) continue;
    const status = str(groupAd.status) || "ENABLED";
    const approvalStatus = str(obj(groupAd.policySummary).approvalStatus) || "DISAPPROVED";
    const current = map.get(id);
    if (current) {
      current.status = status;
      current.approvalStatus = approvalStatus;
      continue;
    }
    map.set(id, {
      id,
      campaignName: str(obj(row.campaign).name),
      adGroupName: str(obj(row.adGroup).name),
      status,
      approvalStatus,
      recent: empty(),
    });
  }
  return [...map.values()];
}

function aggregateSearchTerms(rows: Row[], period: AuditAccount["period"]): SearchTermAudit[] {
  const map = new Map<string, SearchTermAudit>();
  for (const row of rows) {
    const term = str(obj(row.searchTermView).searchTerm);
    const campaignName = str(obj(row.campaign).name);
    if (!term) continue;
    const key = `${campaignName}|${term}`;
    const current = map.get(key) ?? { term, campaignName, recent: empty() };
    const date = str(obj(row.segments).date);
    if (date && inRange(date, period.recentStart, period.recentEnd)) add(current.recent, readMetrics(row));
    map.set(key, current);
  }
  return [...map.values()];
}

function aggregateAds(rows: Row[], period: AuditAccount["period"]): AdAudit[] {
  const map = new Map<string, AdAudit>();
  for (const row of rows) {
    const ad = obj(obj(row.adGroupAd).ad);
    const id = str(ad.id);
    if (!id) continue;
    const groupAd = obj(row.adGroupAd);
    const current =
      map.get(id) ??
      {
        id,
        campaignName: str(obj(row.campaign).name),
        adGroupName: str(obj(row.adGroup).name),
        status: str(groupAd.status) || "",
        approvalStatus: str(obj(groupAd.policySummary).approvalStatus) || "",
        recent: empty(),
      };
    const date = str(obj(row.segments).date);
    if (date && inRange(date, period.recentStart, period.recentEnd)) add(current.recent, readMetrics(row));
    map.set(id, current);
  }
  return [...map.values()];
}

function addInto(
  campaign: { recent: PeriodMetrics; previous: PeriodMetrics },
  date: string,
  period: AuditAccount["period"],
  metrics: PeriodMetrics,
) {
  if (inRange(date, period.recentStart, period.recentEnd)) add(campaign.recent, metrics);
  if (inRange(date, period.previousStart, period.previousEnd)) add(campaign.previous, metrics);
}

function add(target: PeriodMetrics, metrics: PeriodMetrics) {
  target.impressions += metrics.impressions;
  target.clicks += metrics.clicks;
  target.costMicros += metrics.costMicros;
  target.conversions += metrics.conversions;
  target.conversionsValue += metrics.conversionsValue;
}

function readMetrics(row: Row): PeriodMetrics {
  const metrics = obj(row.metrics);
  return {
    impressions: num(metrics.impressions),
    clicks: num(metrics.clicks),
    costMicros: num(metrics.costMicros),
    conversions: num(metrics.conversions),
    conversionsValue: num(metrics.conversionsValue),
  };
}

function empty(): PeriodMetrics {
  return { ...EMPTY_METRICS };
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

function num(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  return 0;
}
