import { describe, expect, it } from "vitest";
import { GoogleAdsClient } from "@/lib/google-ads/client";
import { loadAuditAccount } from "@/lib/google-ads/sync";

describe("lectura de una cuenta real", () => {
  it("no mezcla palabras con el mismo id, conserva el presupuesto perdido de búsqueda y ve un anuncio rechazado sin impresiones", async () => {
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const query = (JSON.parse(String(init?.body)) as { query: string }).query;
      if (query.includes("search_budget_lost_impression_share")) {
        return json({
          results: [
            {
              campaign: { id: "1" },
              segments: { date: "2026-10-20" },
              metrics: { impressions: "100", searchBudgetLostImpressionShare: 0.4 },
            },
          ],
        });
      }
      if (query.includes("FROM campaign")) {
        return json({
          results: [
            rowCampaign("1", "Search", "SEARCH"),
            rowCampaign("2", "PMax", "PERFORMANCE_MAX"),
          ],
        });
      }
      if (query.includes("keyword_view")) {
        return json({
          results: [keyword("10", "A", "una"), keyword("11", "B", "otra")],
        });
      }
      if (query.includes("DISAPPROVED")) {
        return json({
          results: [
            {
              adGroupAd: { status: "ENABLED", policySummary: { approvalStatus: "DISAPPROVED" }, ad: { id: "99" } },
              campaign: { name: "Search" },
              adGroup: { name: "A" },
            },
          ],
        });
      }
      return json({ results: [] });
    };

    const loaded = await loadAuditAccount(
      new GoogleAdsClient("token", fetchImpl),
      {
        externalId: "1234567890",
        name: "Cuenta",
        currencyCode: "ARS",
        timeZone: "UTC",
        loginCustomerId: null,
      },
      new Date("2026-10-22T15:00:00Z"),
    );

    expect(loaded.account.campaigns.find((campaign) => campaign.id === "1")?.searchBudgetLostImpressionShare).toBeCloseTo(0.4);
    expect(loaded.account.campaigns.find((campaign) => campaign.id === "2")?.searchBudgetLostImpressionShare).toBeNull();
    expect(loaded.account.keywords.map((keyword) => keyword.text).sort()).toEqual(["otra", "una"]);
    expect(loaded.account.ads).toEqual([
      expect.objectContaining({ id: "99", approvalStatus: "DISAPPROVED", campaignName: "Search" }),
    ]);
  });
});

function rowCampaign(id: string, name: string, channel: string) {
  return {
    campaign: { id, name, status: "ENABLED", advertisingChannelType: channel },
    segments: { date: "2026-10-20" },
    metrics: { impressions: "100", clicks: "10", costMicros: "5000000", conversions: "1", conversionsValue: "0" },
  };
}

function keyword(adGroupId: string, adGroupName: string, text: string) {
  return {
    adGroup: { id: adGroupId, name: adGroupName },
    adGroupCriterion: {
      criterionId: "7",
      status: "ENABLED",
      keyword: { text, matchType: "EXACT" },
    },
    campaign: { name: "Search" },
    segments: { date: "2026-10-20" },
    metrics: { impressions: "10", clicks: "2", costMicros: "1000000", conversions: "0" },
  };
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
