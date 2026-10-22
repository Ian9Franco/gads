import { createHash } from "node:crypto";
import { cpa, ctr, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { minWasteMicros } from "@/lib/audit/thresholds";
import type {
  AdAudit,
  AuditAccount,
  CampaignAudit,
  FindingDraft,
  GoogleRecommendation,
  KeywordAudit,
  PeriodMetrics,
  SearchTermAudit,
} from "@/lib/audit/types";

const MAX_PER_RULE = 8;

const RECOMMENDATION_LABELS: Record<string, string> = {
  CAMPAIGN_BUDGET: "subir el presupuesto",
  KEYWORD: "agregar palabras clave",
  KEYWORD_MATCH_TYPE: "cambiar el tipo de concordancia",
  TEXT_AD: "reemplazar anuncios de texto",
  TARGET_CPA_OPT_IN: "pasar a CPA objetivo",
  MAXIMIZE_CONVERSIONS_OPT_IN: "maximizar conversiones",
  MAXIMIZE_CONVERSION_VALUE_OPT_IN: "maximizar el valor de conversión",
  ENHANCED_CPC_OPT_IN: "activar CPC mejorado",
  SEARCH_PARTNERS_OPT_IN: "activar socios de búsqueda",
  MOVE_UNUSED_BUDGET: "mover presupuesto no usado",
  FORECASTING_CAMPAIGN_BUDGET: "ajustar el presupuesto según un pronóstico",
  RESPONSIVE_SEARCH_AD: "crear un anuncio de búsqueda adaptable",
  RESPONSIVE_SEARCH_AD_IMPROVE_AD_STRENGTH: "mejorar la fortaleza del anuncio",
};

export function recommendationLabel(type: string): string {
  return RECOMMENDATION_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sampleConfidence(input: {
  clicks: number;
  impressions: number;
  tracking: boolean;
}): { value: number; reason: string } {
  let value = 0.35;
  if (input.impressions >= 1_000) value += 0.2;
  else if (input.impressions >= 300) value += 0.1;
  if (input.clicks >= 30) value += 0.2;
  else if (input.clicks >= 10) value += 0.1;
  value += input.tracking ? 0.15 : -0.2;
  value = Math.min(0.92, Math.max(0.2, value));
  const sample =
    input.clicks >= 30
      ? "La muestra de clics alcanza para señalar el problema."
      : "La muestra es chica: alcanza para revisar, no para dar el hallazgo por cerrado.";
  const tracking = input.tracking
    ? "Hay acciones de conversión activas."
    : "No hay acciones de conversión activas, así que el resultado puede estar incompleto.";
  return { value, reason: `${sample} ${tracking}` };
}

function accountTotals(campaigns: CampaignAudit[], key: "recent" | "previous"): PeriodMetrics {
  return campaigns
    .filter((campaign) => campaign.status === "ENABLED")
    .reduce(
      (total, campaign) => ({
        impressions: total.impressions + campaign[key].impressions,
        clicks: total.clicks + campaign[key].clicks,
        costMicros: total.costMicros + campaign[key].costMicros,
        conversions: total.conversions + campaign[key].conversions,
        conversionsValue: total.conversionsValue + campaign[key].conversionsValue,
      }),
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0, conversionsValue: 0 },
    );
}

function takeTop(drafts: FindingDraft[], limit = MAX_PER_RULE): FindingDraft[] {
  return drafts
    .sort((a, b) => costOf(b) - costOf(a))
    .slice(0, limit);
}

function costOf(draft: FindingDraft): number {
  const match = draft.metrics.find((metric) => metric.label.startsWith("Gasto"));
  if (!match) return 0;
  const digits = match.value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

export function auditAccount(account: AuditAccount): FindingDraft[] {
  const tracking = account.conversionActionsEnabled > 0;
  const waste = minWasteMicros(account.currencyCode);
  const recent = accountTotals(account.campaigns, "recent");
  const drafts: FindingDraft[] = [];

  if (!tracking && recent.costMicros > 0) {
    drafts.push(trackingGap(account, recent));
  }

  if (tracking) {
    drafts.push(...takeTop(campaignsWithoutConversions(account, waste)));
    drafts.push(...takeTop(keywordsWithoutConversions(account, waste)));
    drafts.push(...takeTop(searchTermsWithoutConversions(account, waste)));
  }

  drafts.push(...takeTop(ctrDrops(account, tracking)));
  drafts.push(...takeTop(budgetOpportunities(account, recent)));
  drafts.push(...budgetConcentration(account, recent));
  drafts.push(...takeTop(disapprovedAds(account)));
  drafts.push(...takeTop(lowCtrAds(account)));
  drafts.push(...googleRecommendations(account));

  return drafts.sort(compareFindings);
}

function trackingGap(account: AuditAccount, recent: PeriodMetrics): FindingDraft {
  return {
    ruleId: "tracking_gap",
    severity: "error",
    source: "rule",
    title: "Problema de seguimiento",
    summary: `${account.name} gastó ${formatMoney(recent.costMicros, account.currencyCode)} en el período y no tiene acciones de conversión activas.`,
    suggestion:
      "Revisá la etiqueta o la importación de conversiones antes de pausar campañas o palabras clave. Sin seguimiento, un gasto sin conversiones no se puede diagnosticar.",
    entityType: "account",
    entityId: account.customerId,
    entityName: account.name,
    campaignName: null,
    periodStart: account.period.recentStart,
    periodEnd: account.period.recentEnd,
    metrics: [
      { label: "Gasto del período", value: formatMoney(recent.costMicros, account.currencyCode) },
      { label: "Clics", value: formatNumber(recent.clicks) },
      { label: "Acciones de conversión activas", value: "0" },
    ],
    confidence: 0.9,
    confidenceReason:
      "El estado de las acciones de conversión sale de la configuración de la cuenta, no de una estimación.",
    impactEstimate: null,
    caution: null,
  };
}

function campaignsWithoutConversions(account: AuditAccount, waste: number): FindingDraft[] {
  return account.campaigns
    .filter(
      (campaign) =>
        campaign.status === "ENABLED" &&
        campaign.recent.costMicros >= waste &&
        campaign.recent.conversions === 0 &&
        campaign.recent.clicks >= 8,
    )
    .map((campaign) => {
      const confidence = sampleConfidence({
        clicks: campaign.recent.clicks,
        impressions: campaign.recent.impressions,
        tracking: true,
      });
      return {
        ruleId: "campaign_spend_without_conversions",
        severity: "error" as const,
        source: "rule" as const,
        title: "Gasto sin conversiones",
        summary: `La campaña ${campaign.name} consumió ${formatMoney(campaign.recent.costMicros, account.currencyCode)} entre el ${account.period.recentStart} y el ${account.period.recentEnd} sin registrar conversiones.`,
        suggestion:
          "Revisá la intención de las búsquedas, el anuncio y el seguimiento antes de pausarla. El gasto observado no implica que la campaña no pueda convertir.",
        entityType: "campaign" as const,
        entityId: campaign.id,
        entityName: campaign.name,
        campaignName: campaign.name,
        periodStart: account.period.recentStart,
        periodEnd: account.period.recentEnd,
        metrics: metricRows(account.currencyCode, campaign.recent),
        confidence: confidence.value,
        confidenceReason: confidence.reason,
        impactEstimate: `Gasto observado en el período: ${formatMoney(campaign.recent.costMicros, account.currencyCode)}.`,
        caution: null,
      };
    });
}

function keywordsWithoutConversions(account: AuditAccount, waste: number): FindingDraft[] {
  return account.keywords
    .filter(
      (keyword) =>
        keyword.status === "ENABLED" &&
        keyword.recent.costMicros >= waste &&
        keyword.recent.conversions === 0 &&
        keyword.recent.clicks >= 8,
    )
    .map((keyword) => keywordFinding(account, keyword));
}

function keywordFinding(account: AuditAccount, keyword: KeywordAudit): FindingDraft {
  const confidence = sampleConfidence({
    clicks: keyword.recent.clicks,
    impressions: keyword.recent.impressions,
    tracking: true,
  });
  return {
    ruleId: "keyword_spend_without_conversions",
    severity: "error",
    source: "rule",
    title: "Gasto sin conversiones",
    summary: `La palabra clave «${keyword.text}» consumió ${formatMoney(keyword.recent.costMicros, account.currencyCode)} en 14 días sin registrar conversiones.`,
    suggestion:
      "Revisá el término, su intención de compra y el seguimiento antes de pausarlo.",
    entityType: "keyword",
    entityId: keyword.id,
    entityName: keyword.text,
    campaignName: keyword.campaignName,
    periodStart: account.period.recentStart,
    periodEnd: account.period.recentEnd,
    metrics: [
      ...metricRows(account.currencyCode, keyword.recent),
      { label: "Concordancia", value: keyword.matchType },
      { label: "Grupo de anuncios", value: keyword.adGroupName },
    ],
    confidence: confidence.value,
    confidenceReason: confidence.reason,
    impactEstimate: `Gasto observado en el período: ${formatMoney(keyword.recent.costMicros, account.currencyCode)}.`,
    caution: null,
  };
}

function searchTermsWithoutConversions(account: AuditAccount, waste: number): FindingDraft[] {
  return account.searchTerms
    .filter(
      (term) =>
        term.recent.costMicros >= waste * 0.4 &&
        term.recent.conversions === 0 &&
        term.recent.clicks >= 5,
    )
    .map((term) => searchTermFinding(account, term));
}

function searchTermFinding(account: AuditAccount, term: SearchTermAudit): FindingDraft {
  const confidence = sampleConfidence({
    clicks: term.recent.clicks,
    impressions: term.recent.impressions,
    tracking: true,
  });
  return {
    ruleId: "search_term_spend_without_conversions",
    severity: "opportunity",
    source: "rule",
    title: "Término de búsqueda sin conversiones",
    summary: `El término «${term.term}» gastó ${formatMoney(term.recent.costMicros, account.currencyCode)} en la campaña ${term.campaignName} sin conversiones registradas.`,
    suggestion:
      "Si la búsqueda no tiene intención de compra, agregala como palabra clave negativa. Si puede convertir, revisá el anuncio y la página de destino antes de excluirla.",
    entityType: "search_term",
    entityId: hashId(`${term.campaignName}|${term.term}`),
    entityName: term.term,
    campaignName: term.campaignName,
    periodStart: account.period.recentStart,
    periodEnd: account.period.recentEnd,
    metrics: metricRows(account.currencyCode, term.recent),
    confidence: Math.min(confidence.value, 0.75),
    confidenceReason: `${confidence.reason} Un término de búsqueda no alcanza para declarar que es irrelevante.`,
    impactEstimate: `Gasto observado en el período: ${formatMoney(term.recent.costMicros, account.currencyCode)}.`,
    caution: null,
  };
}

function ctrDrops(account: AuditAccount, tracking: boolean): FindingDraft[] {
  return account.campaigns
    .filter((campaign) => {
      if (campaign.status !== "ENABLED") return false;
      if (campaign.previous.impressions < 500 || campaign.recent.impressions < 500) return false;
      const before = ctr(campaign.previous);
      const after = ctr(campaign.recent);
      return before >= 0.02 && after <= before * 0.6;
    })
    .map((campaign) => {
      const before = ctr(campaign.previous);
      const after = ctr(campaign.recent);
      const confidence = sampleConfidence({
        clicks: campaign.recent.clicks + campaign.previous.clicks,
        impressions: campaign.recent.impressions,
        tracking,
      });
      return {
        ruleId: "campaign_ctr_drop",
        severity: "warning" as const,
        source: "rule" as const,
        title: "Caída de rendimiento",
        summary: `El CTR de ${campaign.name} descendió de ${formatPercent(before)} a ${formatPercent(after)}.`,
        suggestion:
          "Investigá términos de búsqueda, competencia y cambios recientes de anuncios o pujas. La caída describe el período comparado; no indica la causa.",
        entityType: "campaign" as const,
        entityId: campaign.id,
        entityName: campaign.name,
        campaignName: campaign.name,
        periodStart: account.period.previousStart,
        periodEnd: account.period.recentEnd,
        metrics: [
          { label: "CTR período anterior", value: formatPercent(before) },
          { label: "CTR período reciente", value: formatPercent(after) },
          { label: "Impresiones recientes", value: formatNumber(campaign.recent.impressions) },
          { label: "Impresiones anteriores", value: formatNumber(campaign.previous.impressions) },
          { label: "Clics recientes", value: formatNumber(campaign.recent.clicks) },
        ],
        confidence: confidence.value,
        confidenceReason: confidence.reason,
        impactEstimate: null,
        caution: null,
      };
    });
}

function budgetOpportunities(account: AuditAccount, recent: PeriodMetrics): FindingDraft[] {
  const accountCpa = cpa(recent);
  if (accountCpa == null) return [];
  return account.campaigns
    .filter((campaign) => {
      if (campaign.status !== "ENABLED") return false;
      const campaignCpa = cpa(campaign.recent);
      const lost = campaign.searchBudgetLostImpressionShare;
      return (
        campaign.recent.conversions >= 2 &&
        campaignCpa != null &&
        campaignCpa <= accountCpa * 0.85 &&
        lost != null &&
        lost >= 0.15
      );
    })
    .map((campaign) => {
      const campaignCpa = cpa(campaign.recent) ?? 0;
      const lost = campaign.searchBudgetLostImpressionShare ?? 0;
      return {
        ruleId: "budget_limited_efficient",
        severity: "opportunity" as const,
        source: "rule" as const,
        title: "Oportunidad detectada",
        summary: `${campaign.name} tiene un CPA de ${formatMoney(campaignCpa, account.currencyCode)}, por debajo del CPA de la cuenta (${formatMoney(accountCpa, account.currencyCode)}), y pierde impresiones por presupuesto.`,
        suggestion:
          "Evaluá una redistribución gradual del presupuesto. Conviene mover una parte y volver a medir, en lugar de trasladar el presupuesto completo.",
        entityType: "campaign" as const,
        entityId: campaign.id,
        entityName: campaign.name,
        campaignName: campaign.name,
        periodStart: account.period.recentStart,
        periodEnd: account.period.recentEnd,
        metrics: [
          ...metricRows(account.currencyCode, campaign.recent),
          { label: "CPA de la campaña", value: formatMoney(campaignCpa, account.currencyCode) },
          { label: "CPA de la cuenta", value: formatMoney(accountCpa, account.currencyCode) },
          { label: "Impresiones de búsqueda perdidas por presupuesto", value: formatPercent(lost) },
        ],
        confidence: 0.72,
        confidenceReason:
          "El CPA comparado y la participación perdida salen del período reciente. La participación es un promedio ponderado por impresiones diarias, no una proyección de ventas.",
        impactEstimate: `En el período, la campaña perdió ${formatPercent(lost)} de las impresiones de búsqueda por presupuesto.`,
        caution: null,
      };
    });
}

function budgetConcentration(account: AuditAccount, recent: PeriodMetrics): FindingDraft[] {
  if (recent.costMicros <= 0) return [];
  const enabled = account.campaigns.filter((campaign) => campaign.status === "ENABLED");
  const dominant = enabled
    .slice()
    .sort((a, b) => b.recent.costMicros - a.recent.costMicros)[0];
  if (!dominant) return [];
  const share = dominant.recent.costMicros / recent.costMicros;
  if (share < 0.65) return [];
  const dominantCpa = cpa(dominant.recent);
  const accountCpa = cpa(recent);
  const worse =
    (dominant.recent.conversions === 0 && recent.conversions > 0) ||
    (dominantCpa != null && accountCpa != null && dominantCpa > accountCpa * 1.5);
  if (!worse) return [];
  return [
    {
      ruleId: "budget_concentration",
      severity: "warning",
      source: "rule",
      title: "Presupuesto concentrado",
      summary: `${dominant.name} concentra ${formatPercent(share)} del gasto reciente y rinde peor que el conjunto de la cuenta.`,
      suggestion:
        "Revisá si esa concentración es intencional. Si no lo es, probá una redistribución chica hacia campañas con mejor CPA.",
      entityType: "campaign",
      entityId: dominant.id,
      entityName: dominant.name,
      campaignName: dominant.name,
      periodStart: account.period.recentStart,
      periodEnd: account.period.recentEnd,
      metrics: [
        { label: "Participación del gasto", value: formatPercent(share) },
        { label: "Gasto de la campaña", value: formatMoney(dominant.recent.costMicros, account.currencyCode) },
        { label: "Gasto de la cuenta", value: formatMoney(recent.costMicros, account.currencyCode) },
      ],
      confidence: 0.7,
      confidenceReason: "La participación del gasto se calcula sobre las campañas activas del período.",
      impactEstimate: null,
      caution: null,
    },
  ];
}

function disapprovedAds(account: AuditAccount): FindingDraft[] {
  return account.ads
    .filter((ad) => ad.status === "ENABLED" && ad.approvalStatus === "DISAPPROVED")
    .map((ad) => adFinding(account, ad));
}

function adFinding(account: AuditAccount, ad: AdAudit): FindingDraft {
  return {
    ruleId: "disapproved_ad",
    severity: "error",
    source: "rule",
    title: "Anuncio rechazado",
    summary: `Un anuncio activo de ${ad.campaignName} / ${ad.adGroupName} está rechazado.`,
    suggestion:
      "Abrí el motivo de rechazo en Google Ads y corregí el anuncio o la página de destino. Este auditor no modifica el anuncio.",
    entityType: "ad",
    entityId: ad.id,
    entityName: `${ad.campaignName} / ${ad.adGroupName}`,
    campaignName: ad.campaignName,
    periodStart: account.period.recentStart,
    periodEnd: account.period.recentEnd,
    metrics: [
      { label: "Estado del anuncio", value: ad.status },
      { label: "Aprobación", value: ad.approvalStatus },
      { label: "Impresiones recientes", value: formatNumber(ad.recent.impressions) },
    ],
    confidence: 0.95,
    confidenceReason: "El estado de aprobación lo informa Google Ads. No es una inferencia estadística.",
    impactEstimate: null,
    caution: null,
  };
}

function lowCtrAds(account: AuditAccount): FindingDraft[] {
  const byCampaign = new Map(account.campaigns.map((campaign) => [campaign.name, campaign]));
  return account.ads.flatMap((ad) => {
    const campaign = byCampaign.get(ad.campaignName);
    if (!campaign || ad.status !== "ENABLED" || ad.approvalStatus === "DISAPPROVED") return [];
    if (ad.recent.impressions < 800 || campaign.recent.impressions < 800) return [];
    const adCtr = ctr(ad.recent);
    const campaignCtr = ctr(campaign.recent);
    if (campaignCtr <= 0.01 || adCtr >= campaignCtr * 0.45) return [];
    const confidence = sampleConfidence({
      clicks: ad.recent.clicks,
      impressions: ad.recent.impressions,
      tracking: account.conversionActionsEnabled > 0,
    });
    return [
      {
        ruleId: "low_ctr_ad",
        severity: "opportunity" as const,
        source: "rule" as const,
        title: "Anuncio con CTR bajo",
        summary: `Un anuncio de ${ad.adGroupName} tiene un CTR de ${formatPercent(adCtr)}, frente a ${formatPercent(campaignCtr)} de la campaña ${ad.campaignName}.`,
        suggestion:
          "Compará el mensaje con los anuncios que sí se cliquean y revisá si la promesa coincide con la búsqueda. No lo pauses solo por este indicador.",
        entityType: "ad" as const,
        entityId: ad.id,
        entityName: `${ad.campaignName} / ${ad.adGroupName}`,
        campaignName: ad.campaignName,
        periodStart: account.period.recentStart,
        periodEnd: account.period.recentEnd,
        metrics: [
          { label: "CTR del anuncio", value: formatPercent(adCtr) },
          { label: "CTR de la campaña", value: formatPercent(campaignCtr) },
          { label: "Impresiones del anuncio", value: formatNumber(ad.recent.impressions) },
        ],
        confidence: confidence.value,
        confidenceReason: confidence.reason,
        impactEstimate: null,
        caution: null,
      },
    ];
  });
}

function googleRecommendations(account: AuditAccount): FindingDraft[] {
  const grouped = new Map<string, GoogleRecommendation[]>();
  for (const recommendation of account.googleRecommendations) {
    const list = grouped.get(recommendation.type) ?? [];
    list.push(recommendation);
    grouped.set(recommendation.type, list);
  }
  return [...grouped.entries()].slice(0, MAX_PER_RULE).map(([type, items]) => ({
    ruleId: "google_recommendation",
    severity: "opportunity" as const,
    source: "google_recommendation" as const,
    title: "Recomendación de Google para revisar",
    summary: `Google sugiere ${recommendationLabel(type)} en ${items.length} ${items.length === 1 ? "recomendación" : "recomendaciones"}.`,
    suggestion:
      "Revisala con los datos de la cuenta. No la apliques solo porque Google la propone.",
    entityType: "recommendation" as const,
    entityId: type,
    entityName: recommendationLabel(type),
    campaignName: items.find((item) => item.campaignName)?.campaignName ?? null,
    periodStart: account.period.recentStart,
    periodEnd: account.period.recentEnd,
    metrics: [
      { label: "Tipo", value: type },
      { label: "Cantidad", value: String(items.length) },
    ],
    confidence: 0.3,
    confidenceReason:
      "Esta ficha solo registra que la recomendación existe. No hay evidencia en este auditor de que mejore el resultado del anunciante.",
    impactEstimate: null,
    caution:
      "Las recomendaciones automáticas de Google no necesariamente benefician al anunciante. El impacto que muestra Google no se reproduce acá como un hecho.",
  }));
}

function metricRows(currency: string, metrics: PeriodMetrics) {
  return [
    { label: "Gasto del período", value: formatMoney(metrics.costMicros, currency) },
    { label: "Clics", value: formatNumber(metrics.clicks) },
    { label: "Impresiones", value: formatNumber(metrics.impressions) },
    { label: "Conversiones", value: formatNumber(metrics.conversions) },
    { label: "CTR", value: formatPercent(ctr(metrics)) },
  ];
}

function compareFindings(a: FindingDraft, b: FindingDraft): number {
  const rank = { error: 0, warning: 1, opportunity: 2 };
  return rank[a.severity] - rank[b.severity] || costOf(b) - costOf(a);
}
