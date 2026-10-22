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
    `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value, metrics.search_budget_lost_impression_share FROM campaign WHERE ${range} AND campaign.status != 'REMOVED'`,
    login,
  );

  const keywords = await optionalSearch(
    client,
    account.externalId,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, campaign.name, ad_group.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE ${range} AND ad_group_criterion.status != 'REMOVED'`,
    login,
    notes,
    "palabras clave",
  );
  const searchTerms = await optionalSearch(
    client,
    account.externalId,
    `SELECT search_term_view.search_term, campaign.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE ${range}`,
    login,
    notes,
    "términos de búsqueda",
  );
  const ads = await optionalSearch(
    client,
    account.externalId,
    `SELECT ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.policy_summary.approval_status, campaign.name, ad_group.name, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group_ad WHERE ${range} AND ad_group_ad.status != 'REMOVED'`,
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
      campaigns: aggregateCampaigns(campaignRows, period),
      keywords: aggregateKeywords(keywords, period),
      searchTerms: aggregateSearchTerms(searchTerms, period),
      ads: aggregateAds(ads, period),
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
  const map = new Map<string, CampaignAudit & { lostWeight: number; lostImpressions: number }>();
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
        lostWeight: 0,
        lostImpressions: 0,
      };
    const metrics = readMetrics(row);
    const date = str(obj(row.segments).date);
    addInto(current, date, period, metrics);
    const lost = num(obj(row.metrics).searchBudgetLostImpressionShare);
    if (date && inRange(date, period.recentStart, period.recentEnd) && metrics.impressions > 0) {
      current.lostWeight += lost * metrics.impressions;
      current.lostImpressions += metrics.impressions;
    }
    map.set(id, current);
  }
  return [...map.values()].map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    channel: campaign.channel,
    recent: campaign.recent,
    previous: campaign.previous,
    searchBudgetLostImpressionShare:
      campaign.lostImpressions > 0 ? campaign.lostWeight / campaign.lostImpressions : null,
  }));
}

function aggregateKeywords(rows: Row[], period: AuditAccount["period"]): KeywordAudit[] {
  const map = new Map<string, KeywordAudit>();
  for (const row of rows) {
    const criterion = obj(row.adGroupCriterion);
    const id = str(criterion.criterionId);
    if (!id) continue;
    const keyword = obj(criterion.keyword);
    const current =
      map.get(id) ??
      {
        id,
        text: str(keyword.text) || id,
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
