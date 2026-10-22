import type { SupabaseClient } from "@supabase/supabase-js";
import { auditAccount } from "@/lib/audit/engine";
import { DEMO_CUSTOMER_EXTERNAL_ID, demoAccount } from "@/lib/audit/demo";
import { fingerprintOf } from "@/lib/store/types";
import type {
  AuditorStore,
  AuditRun,
  Connection,
  Customer,
  Decision,
  DecisionAction,
  Finding,
} from "@/lib/store/types";
import type { FindingDraft } from "@/lib/audit/types";

type CustomerRow = {
  id: string;
  external_id: string;
  name: string;
  currency_code: string;
  time_zone: string;
  is_demo: boolean;
  access: Customer["access"];
  login_customer_id: string | null;
  connection_id: string | null;
  last_audit_at: string | null;
  last_audit_error: string | null;
};

type FindingRow = {
  id: string;
  customer_id: string;
  fingerprint: string;
  rule_id: string;
  severity: Finding["severity"];
  status: Finding["status"];
  source: Finding["source"];
  title: string;
  summary: string;
  suggestion: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  campaign_name: string | null;
  period_start: string;
  period_end: string;
  metrics: Finding["metrics"];
  confidence: number;
  confidence_reason: string;
  impact_estimate: string | null;
  caution: string | null;
  interpretation: string | null;
  interpretation_model: string | null;
  interpretation_at: string | null;
  updated_at: string;
};

export function createSupabaseStore(client: SupabaseClient): AuditorStore {
  return {
    async ensureReady() {
      const { data, error } = await client
        .from("customers")
        .select("id")
        .eq("external_id", DEMO_CUSTOMER_EXTERNAL_ID)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) return;
      const inserted = await client
        .from("customers")
        .insert({
          external_id: DEMO_CUSTOMER_EXTERNAL_ID,
          name: "Da Milán",
          currency_code: "ARS",
          time_zone: "America/Argentina/Buenos_Aires",
          is_demo: true,
          access: "demo",
        })
        .select("id")
        .single();
      if (inserted.error || !inserted.data) throw new Error(inserted.error?.message ?? "No se pudo crear la muestra.");
      const drafts = auditAccount(demoAccount());
      const now = new Date().toISOString();
      await client.from("findings").insert(
        drafts.map((draft) => ({
          customer_id: inserted.data.id,
          fingerprint: fingerprintOf(DEMO_CUSTOMER_EXTERNAL_ID, draft),
          ...draftToRow(draft),
          updated_at: now,
        })),
      );
      await client
        .from("customers")
        .update({ last_audit_at: now, last_audit_error: null })
        .eq("id", inserted.data.id);
      await client.from("audit_runs").insert({
        customer_id: inserted.data.id,
        started_at: now,
        finished_at: now,
        status: "ok",
        finding_count: drafts.length,
        operation_count: 0,
        message: "Cuenta de muestra. Los datos no salen de Google Ads.",
      });
    },
    async listCustomers() {
      const { data, error } = await client.from("customers").select("*").order("name");
      if (error) throw new Error(error.message);
      return (data as CustomerRow[]).map(toCustomer);
    },
    async getCustomer(id) {
      const { data, error } = await client.from("customers").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toCustomer(data as CustomerRow) : null;
    },
    async listFindings(filter) {
      let query = client.from("findings").select("*");
      if (filter?.customerId) query = query.eq("customer_id", filter.customerId);
      if (filter?.status && filter.status !== "all") query = query.eq("status", filter.status);
      if (filter?.severity && filter.severity !== "all") query = query.eq("severity", filter.severity);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data as FindingRow[])
        .map(toFinding)
        .sort((a, b) => rank(a.severity) - rank(b.severity) || b.updatedAt.localeCompare(a.updatedAt));
    },
    async getFinding(id) {
      const { data, error } = await client.from("findings").select("*").eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? toFinding(data as FindingRow) : null;
    },
    async listDecisions(findingId) {
      const { data, error } = await client
        .from("decisions")
        .select("*")
        .eq("finding_id", findingId)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({
        id: String(row.id),
        findingId: String(row.finding_id),
        action: row.action as Decision["action"],
        note: String(row.note ?? ""),
        createdAt: String(row.created_at),
      }));
    },
    async listRuns(customerId) {
      let query = client.from("audit_runs").select("*").order("finished_at", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []).map(toRun);
    },
    async listConnections() {
      const { data, error } = await client.from("connections").select("*").order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []).map(toConnection);
    },
    async saveConnection(input) {
      const created = await client
        .from("connections")
        .insert({
          google_email: input.googleEmail,
          access_mode: input.accessMode,
          refresh_token: input.refreshToken,
        })
        .select("*")
        .single();
      if (created.error || !created.data) throw new Error(created.error?.message ?? "No se pudo guardar la conexión.");
      for (const incoming of input.customers) {
        const existing = await client
          .from("customers")
          .select("id")
          .eq("external_id", incoming.externalId)
          .maybeSingle();
        if (existing.error) throw new Error(existing.error.message);
        const row = {
          name: incoming.name,
          currency_code: incoming.currencyCode,
          time_zone: incoming.timeZone,
          access: incoming.access,
          login_customer_id: incoming.loginCustomerId,
          connection_id: created.data.id,
          is_demo: false,
        };
        if (existing.data) {
          const updated = await client.from("customers").update(row).eq("id", existing.data.id);
          if (updated.error) throw new Error(updated.error.message);
        } else {
          const inserted = await client.from("customers").insert({ ...row, external_id: incoming.externalId });
          if (inserted.error) throw new Error(inserted.error.message);
        }
      }
      return toConnection(created.data);
    },
    async applyAudit(customerId, drafts, run) {
      const customer = await this.getCustomer(customerId);
      if (!customer) throw new Error("No encontramos la cuenta.");
      const now = new Date().toISOString();
      const existing = await client.from("findings").select("id, fingerprint, status").eq("customer_id", customerId);
      if (existing.error) throw new Error(existing.error.message);
      const fingerprints = new Set(drafts.map((draft) => fingerprintOf(customer.externalId, draft)));
      for (const row of existing.data ?? []) {
        if (row.status === "open" && !fingerprints.has(String(row.fingerprint))) {
          await client.from("findings").update({ status: "resolved", updated_at: now }).eq("id", row.id);
        }
      }
      for (const draft of drafts) {
        const fingerprint = fingerprintOf(customer.externalId, draft);
        const current = (existing.data ?? []).find((row) => row.fingerprint === fingerprint);
        if (current) {
          const status = current.status === "resolved" ? "open" : current.status;
          const updated = await client
            .from("findings")
            .update({ ...draftToRow(draft), status, updated_at: now })
            .eq("id", current.id);
          if (updated.error) throw new Error(updated.error.message);
          continue;
        }
        const inserted = await client.from("findings").insert({
          customer_id: customerId,
          fingerprint,
          ...draftToRow(draft),
          updated_at: now,
        });
        if (inserted.error) throw new Error(inserted.error.message);
      }
      await client
        .from("customers")
        .update({ last_audit_at: run.finishedAt, last_audit_error: null })
        .eq("id", customerId);
      await client.from("audit_runs").insert({
        customer_id: customerId,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        status: run.status,
        finding_count: run.findingCount,
        operation_count: run.operationCount,
        message: run.message,
      });
      return drafts.length;
    },
    async recordFailure(customerId, run) {
      await client
        .from("customers")
        .update({ last_audit_at: run.finishedAt, last_audit_error: run.message })
        .eq("id", customerId);
      const inserted = await client.from("audit_runs").insert({
        customer_id: customerId,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
        status: run.status,
        finding_count: run.findingCount,
        operation_count: run.operationCount,
        message: run.message,
      });
      if (inserted.error) throw new Error(inserted.error.message);
    },
    async setDecision(findingId, action, note) {
      const now = new Date().toISOString();
      const updated = await client
        .from("findings")
        .update({ status: statusFor(action), updated_at: now })
        .eq("id", findingId);
      if (updated.error) throw new Error(updated.error.message);
      const inserted = await client.from("decisions").insert({
        finding_id: findingId,
        action,
        note: note.trim(),
        created_at: now,
      });
      if (inserted.error) throw new Error(inserted.error.message);
    },
    async saveInterpretation(findingId, text, model) {
      const now = new Date().toISOString();
      const updated = await client
        .from("findings")
        .update({
          interpretation: text,
          interpretation_model: model,
          interpretation_at: now,
          updated_at: now,
        })
        .eq("id", findingId);
      if (updated.error) throw new Error(updated.error.message);
    },
  };
}

function draftToRow(draft: FindingDraft) {
  return {
    rule_id: draft.ruleId,
    severity: draft.severity,
    source: draft.source,
    title: draft.title,
    summary: draft.summary,
    suggestion: draft.suggestion,
    entity_type: draft.entityType,
    entity_id: draft.entityId,
    entity_name: draft.entityName,
    campaign_name: draft.campaignName,
    period_start: draft.periodStart,
    period_end: draft.periodEnd,
    metrics: draft.metrics,
    confidence: draft.confidence,
    confidence_reason: draft.confidenceReason,
    impact_estimate: draft.impactEstimate,
    caution: draft.caution,
  };
}

function toCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    currencyCode: row.currency_code,
    timeZone: row.time_zone,
    isDemo: row.is_demo,
    access: row.access,
    loginCustomerId: row.login_customer_id,
    connectionId: row.connection_id,
    lastAuditAt: row.last_audit_at,
    lastAuditError: row.last_audit_error,
  };
}

function toFinding(row: FindingRow): Finding {
  return {
    id: row.id,
    customerId: row.customer_id,
    fingerprint: row.fingerprint,
    ruleId: row.rule_id,
    severity: row.severity,
    status: row.status,
    source: row.source,
    title: row.title,
    summary: row.summary,
    suggestion: row.suggestion,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityName: row.entity_name,
    campaignName: row.campaign_name,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    metrics: row.metrics,
    confidence: Number(row.confidence),
    confidenceReason: row.confidence_reason,
    impactEstimate: row.impact_estimate,
    caution: row.caution,
    interpretation: row.interpretation,
    interpretationModel: row.interpretation_model,
    interpretationAt: row.interpretation_at,
    updatedAt: row.updated_at,
  };
}

function toRun(row: Record<string, unknown>): AuditRun {
  return {
    id: String(row.id),
    customerId: String(row.customer_id),
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    status: row.status as AuditRun["status"],
    findingCount: Number(row.finding_count),
    operationCount: Number(row.operation_count),
    message: row.message == null ? null : String(row.message),
  };
}

function toConnection(row: Record<string, unknown>): Connection {
  return {
    id: String(row.id),
    googleEmail: String(row.google_email),
    accessMode: row.access_mode as Connection["accessMode"],
    refreshToken: String(row.refresh_token),
    createdAt: String(row.created_at),
  };
}

function statusFor(action: DecisionAction): Finding["status"] {
  if (action === "reopened") return "open";
  return action;
}

function rank(severity: Finding["severity"]): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}
