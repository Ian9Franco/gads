export type Severity = "error" | "warning" | "opportunity";

export type FindingSource = "rule" | "google_recommendation";

export type EntityType =
  | "account"
  | "campaign"
  | "keyword"
  | "search_term"
  | "ad"
  | "recommendation";

export type PeriodMetrics = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
  conversionsValue: number;
};

export type EvidenceMetric = {
  label: string;
  value: string;
};

export type CampaignAudit = {
  id: string;
  name: string;
  status: string;
  channel: string;
  recent: PeriodMetrics;
  previous: PeriodMetrics;
  searchBudgetLostImpressionShare: number | null;
};

export type KeywordAudit = {
  id: string;
  text: string;
  matchType: string;
  campaignName: string;
  adGroupName: string;
  status: string;
  recent: PeriodMetrics;
};

export type SearchTermAudit = {
  term: string;
  campaignName: string;
  recent: PeriodMetrics;
};

export type AdAudit = {
  id: string;
  campaignName: string;
  adGroupName: string;
  status: string;
  approvalStatus: string;
  recent: PeriodMetrics;
};

export type GoogleRecommendation = {
  type: string;
  campaignName?: string;
};

export type AuditAccount = {
  customerId: string;
  name: string;
  currencyCode: string;
  period: {
    recentStart: string;
    recentEnd: string;
    previousStart: string;
    previousEnd: string;
  };
  conversionActionsEnabled: number;
  campaigns: CampaignAudit[];
  keywords: KeywordAudit[];
  searchTerms: SearchTermAudit[];
  ads: AdAudit[];
  googleRecommendations: GoogleRecommendation[];
};

export type FindingDraft = {
  ruleId: string;
  severity: Severity;
  source: FindingSource;
  title: string;
  summary: string;
  suggestion: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  campaignName: string | null;
  periodStart: string;
  periodEnd: string;
  metrics: EvidenceMetric[];
  confidence: number;
  confidenceReason: string;
  impactEstimate: string | null;
  caution: string | null;
};

export const EMPTY_METRICS: PeriodMetrics = {
  impressions: 0,
  clicks: 0,
  costMicros: 0,
  conversions: 0,
  conversionsValue: 0,
};
