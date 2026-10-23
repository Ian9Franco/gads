"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { interpretFinding } from "@/lib/audit/narrative";
import { auditConnectedCustomers, auditStoredCustomer } from "@/lib/audit/run-customer";
import { grantAccess } from "@/lib/auth";
import { getStore } from "@/lib/store";
import type { DecisionAction } from "@/lib/store/types";

export async function loginAction(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const ok = await grantAccess(password);
  if (!ok) redirect("/acceso?error=1");
  redirect("/");
}

export async function auditAction(formData: FormData) {
  const customerId = String(formData.get("customerId") ?? "");
  try {
    await auditStoredCustomer(customerId);
  } catch (error) {
    redirect(`/cuentas?error=${encodeURIComponent(publicError(error))}`);
  }
  revalidatePath("/");
  revalidatePath("/hallazgos");
  revalidatePath("/cuentas");
  redirect(`/cuentas?auditada=${encodeURIComponent(customerId)}`);
}

export async function auditAllAction() {
  const result = await auditConnectedCustomers();
  revalidatePath("/");
  revalidatePath("/hallazgos");
  revalidatePath("/cuentas");
  redirect(`/cuentas?lote=${result.audited}&fallidas=${result.failed}`);
}

export async function decisionAction(formData: FormData) {
  const findingId = String(formData.get("findingId") ?? "");
  const action = String(formData.get("decision") ?? "") as DecisionAction;
  const note = String(formData.get("note") ?? "");
  if (!["accepted", "dismissed", "done", "reopened"].includes(action)) {
    throw new Error("Decisión desconocida.");
  }
  await getStore().setDecision(findingId, action, note);
  revalidatePath(`/hallazgos/${findingId}`);
  revalidatePath("/hallazgos");
  revalidatePath("/");
}

export async function explainAction(formData: FormData) {
  const findingId = String(formData.get("findingId") ?? "");
  const store = getStore();
  const finding = await store.getFinding(findingId);
  if (!finding) throw new Error("No encontramos el hallazgo.");
  try {
    const interpretation = await interpretFinding({
      ruleId: finding.ruleId,
      severity: finding.severity,
      source: finding.source,
      title: finding.title,
      summary: finding.summary,
      suggestion: finding.suggestion,
      entityType: finding.entityType as "campaign",
      entityId: finding.entityId,
      entityName: finding.entityName,
      campaignName: finding.campaignName,
      periodStart: finding.periodStart,
      periodEnd: finding.periodEnd,
      metrics: finding.metrics,
      confidence: finding.confidence,
      confidenceReason: finding.confidenceReason,
      impactEstimate: finding.impactEstimate,
      caution: finding.caution,
    });
    await store.saveInterpretation(findingId, interpretation.text, interpretation.model);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo redactar la explicación.";
    redirect(`/hallazgos/${findingId}?explicacion=${encodeURIComponent(message)}`);
  }
  revalidatePath(`/hallazgos/${findingId}`);
  redirect(`/hallazgos/${findingId}`);
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Falló la auditoría.";
  return message.slice(0, 280);
}
