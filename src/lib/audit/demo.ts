import { moneyMicros } from "@/lib/format";
import type { AuditAccount, PeriodMetrics } from "@/lib/audit/types";

export const DEMO_CUSTOMER_EXTERNAL_ID = "demo-da-milan";

export const DEMO_PERIOD = {
  recentStart: "2026-10-08",
  recentEnd: "2026-10-21",
  previousStart: "2026-09-24",
  previousEnd: "2026-10-07",
};

function period(partial: Partial<PeriodMetrics>): PeriodMetrics {
  return {
    impressions: 0,
    clicks: 0,
    costMicros: 0,
    conversions: 0,
    conversionsValue: 0,
    ...partial,
  };
}

export function demoAccount(): AuditAccount {
  return {
    customerId: DEMO_CUSTOMER_EXTERNAL_ID,
    name: "Da Milán",
    currencyCode: "ARS",
    period: DEMO_PERIOD,
    conversionActionsEnabled: 1,
    campaigns: [
      {
        id: "1001",
        name: "Búsqueda - marca",
        status: "ENABLED",
        channel: "SEARCH",
        previous: period({
          impressions: 10_000,
          clicks: 620,
          costMicros: moneyMicros(90_000),
          conversions: 18,
        }),
        recent: period({
          impressions: 10_000,
          clicks: 310,
          costMicros: moneyMicros(120_000),
          conversions: 10,
        }),
        searchBudgetLostImpressionShare: 0.04,
      },
      {
        id: "1002",
        name: "Shopping - outlet",
        status: "ENABLED",
        channel: "SHOPPING",
        previous: period({
          impressions: 8_000,
          clicks: 240,
          costMicros: moneyMicros(70_000),
          conversions: 30,
        }),
        recent: period({
          impressions: 6_000,
          clicks: 210,
          costMicros: moneyMicros(80_000),
          conversions: 40,
        }),
        searchBudgetLostImpressionShare: 0.32,
      },
      {
        id: "1003",
        name: "Búsqueda - genéricas",
        status: "ENABLED",
        channel: "SEARCH",
        previous: period({
          impressions: 4_000,
          clicks: 90,
          costMicros: moneyMicros(40_000),
          conversions: 3,
        }),
        recent: period({
          impressions: 5_000,
          clicks: 110,
          costMicros: moneyMicros(45_000),
          conversions: 2,
        }),
        searchBudgetLostImpressionShare: 0.02,
      },
    ],
    keywords: [
      {
        id: "501",
        text: "zapatillas milán outlet",
        matchType: "BROAD",
        campaignName: "Búsqueda - genéricas",
        adGroupName: "Outlet",
        status: "ENABLED",
        recent: period({
          impressions: 2_400,
          clicks: 48,
          costMicros: moneyMicros(35_000),
          conversions: 0,
        }),
      },
    ],
    searchTerms: [
      {
        term: "milán empleo",
        campaignName: "Búsqueda - genéricas",
        recent: period({
          impressions: 900,
          clicks: 22,
          costMicros: moneyMicros(18_000),
          conversions: 0,
        }),
      },
    ],
    ads: [
      {
        id: "900",
        campaignName: "Búsqueda - marca",
        adGroupName: "Marca exacta",
        status: "ENABLED",
        approvalStatus: "DISAPPROVED",
        recent: period({ impressions: 0, clicks: 0, costMicros: 0, conversions: 0 }),
      },
    ],
    googleRecommendations: [
      { type: "CAMPAIGN_BUDGET", campaignName: "Shopping - outlet" },
    ],
  };
}
