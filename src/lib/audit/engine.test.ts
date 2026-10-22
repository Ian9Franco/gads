import { describe, expect, it } from "vitest";
import { auditAccount } from "@/lib/audit/engine";
import { demoAccount } from "@/lib/audit/demo";
import type { AuditAccount } from "@/lib/audit/types";
import { EMPTY_METRICS } from "@/lib/audit/types";

describe("auditor de Da Milán", () => {
  const findings = auditAccount(demoAccount());

  it("detecta gasto sin conversiones, caída de CTR y oportunidad de presupuesto", () => {
    expect(findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining([
        "keyword_spend_without_conversions",
        "campaign_ctr_drop",
        "budget_limited_efficient",
      ]),
    );
    const keyword = findings.find((finding) => finding.ruleId === "keyword_spend_without_conversions");
    expect(keyword?.summary).toContain("35.000");
    expect(keyword?.summary).toContain("14 días");
    expect(keyword?.suggestion).toContain("antes de pausarlo");

    const drop = findings.find((finding) => finding.ruleId === "campaign_ctr_drop");
    expect(drop?.summary).toContain("6,2");
    expect(drop?.summary).toContain("3,1");

    const budget = findings.find((finding) => finding.ruleId === "budget_limited_efficient");
    expect(budget?.suggestion).toContain("redistribución gradual");
    expect(budget?.impactEstimate).toContain("32,0");
  });

  it("marca el anuncio rechazado y no trata la recomendación de Google como un hecho", () => {
    const ad = findings.find((finding) => finding.ruleId === "disapproved_ad");
    expect(ad?.confidence).toBeGreaterThan(0.9);
    const recommendation = findings.find((finding) => finding.ruleId === "google_recommendation");
    expect(recommendation?.source).toBe("google_recommendation");
    expect(recommendation?.confidence).toBeLessThanOrEqual(0.35);
    expect(recommendation?.caution).toMatch(/no necesariamente/i);
  });

  it("no diagnostica gasto sin conversiones cuando falta el seguimiento", () => {
    const account: AuditAccount = {
      ...demoAccount(),
      conversionActionsEnabled: 0,
    };
    const next = auditAccount(account);
    expect(next.some((finding) => finding.ruleId === "tracking_gap")).toBe(true);
    expect(next.some((finding) => finding.ruleId === "keyword_spend_without_conversions")).toBe(false);
  });

  it("no inventa una oportunidad de presupuesto sin impresiones perdidas", () => {
    const account = demoAccount();
    account.campaigns = account.campaigns.map((campaign) => ({
      ...campaign,
      searchBudgetLostImpressionShare: 0.01,
      recent: { ...EMPTY_METRICS, ...campaign.recent },
    }));
    expect(auditAccount(account).some((finding) => finding.ruleId === "budget_limited_efficient")).toBe(false);
  });
});
