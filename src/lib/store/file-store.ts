import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
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
  FindingFilter,
} from "@/lib/store/types";
import type { FindingDraft } from "@/lib/audit/types";

type FileData = {
  customers: Customer[];
  findings: Finding[];
  decisions: Decision[];
  runs: AuditRun[];
  connections: Connection[];
};

const EMPTY: FileData = {
  customers: [],
  findings: [],
  decisions: [],
  runs: [],
  connections: [],
};

export function createFileStore(filePath: string): AuditorStore {
  let chain: Promise<unknown> = Promise.resolve();
  const locked = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  async function read(): Promise<FileData> {
    try {
      const raw = await readFile(filePath, "utf8");
      return { ...EMPTY, ...(JSON.parse(raw) as FileData) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(EMPTY);
      throw error;
    }
  }

  async function write(data: FileData): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2));
    await rename(temporary, filePath);
  }

  return {
    async ensureReady() {
      await locked(async () => {
        const data = await read();
        if (data.customers.some((customer) => customer.externalId === DEMO_CUSTOMER_EXTERNAL_ID)) return;
        const customer: Customer = {
          id: randomUUID(),
          externalId: DEMO_CUSTOMER_EXTERNAL_ID,
          name: "Da Milán",
          currencyCode: "ARS",
          timeZone: "America/Argentina/Buenos_Aires",
          isDemo: true,
          access: "demo",
          loginCustomerId: null,
          connectionId: null,
          lastAuditAt: null,
          lastAuditError: null,
        };
        data.customers.push(customer);
        const drafts = auditAccount(demoAccount());
        const now = new Date().toISOString();
        data.findings.push(...drafts.map((draft) => toFinding(customer.id, customer.externalId, draft, now)));
        customer.lastAuditAt = now;
        data.runs.push({
          id: randomUUID(),
          customerId: customer.id,
          startedAt: now,
          finishedAt: now,
          status: "ok",
          findingCount: drafts.length,
          operationCount: 0,
          message: "Cuenta de muestra. Los datos no salen de Google Ads.",
        });
        await write(data);
      });
    },
    listCustomers: () => locked(async () => (await read()).customers),
    getCustomer: (id) => locked(async () => (await read()).customers.find((customer) => customer.id === id) ?? null),
    listFindings: (filter) => locked(async () => applyFilter((await read()).findings, filter)),
    getFinding: (id) => locked(async () => (await read()).findings.find((finding) => finding.id === id) ?? null),
    listDecisions: (findingId) =>
      locked(async () =>
        (await read()).decisions
          .filter((decision) => decision.findingId === findingId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),
    listRuns: (customerId) =>
      locked(async () =>
        (await read()).runs
          .filter((run) => !customerId || run.customerId === customerId)
          .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),
      ),
    listConnections: () => locked(async () => (await read()).connections),
    saveConnection: (input) =>
      locked(async () => {
        const data = await read();
        const previous = data.connections.find((item) => item.googleEmail === input.googleEmail);
        const connection: Connection = previous ?? {
          id: randomUUID(),
          googleEmail: input.googleEmail,
          accessMode: input.accessMode,
          refreshToken: input.refreshToken,
          createdAt: new Date().toISOString(),
        };
        connection.accessMode = input.accessMode;
        connection.refreshToken = input.refreshToken;
        if (!previous) data.connections.push(connection);
        for (const incoming of input.customers) {
          const existing = data.customers.find((customer) => customer.externalId === incoming.externalId);
          if (existing) {
            existing.name = incoming.name;
            existing.currencyCode = incoming.currencyCode;
            existing.timeZone = incoming.timeZone;
            existing.access = incoming.access;
            existing.loginCustomerId = incoming.loginCustomerId;
            existing.connectionId = connection.id;
            continue;
          }
          data.customers.push({
            id: randomUUID(),
            externalId: incoming.externalId,
            name: incoming.name,
            currencyCode: incoming.currencyCode,
            timeZone: incoming.timeZone,
            isDemo: false,
            access: incoming.access,
            loginCustomerId: incoming.loginCustomerId,
            connectionId: connection.id,
            lastAuditAt: null,
            lastAuditError: null,
          });
        }
        await write(data);
        return connection;
      }),
    applyAudit: (customerId, drafts, run) =>
      locked(async () => {
        const data = await read();
        const customer = requiredCustomer(data, customerId);
        const now = new Date().toISOString();
        const fingerprints = new Set(drafts.map((draft) => fingerprintOf(customer.externalId, draft)));
        for (const finding of data.findings) {
          if (finding.customerId === customerId && finding.status === "open" && !fingerprints.has(finding.fingerprint)) {
            finding.status = "resolved";
            finding.updatedAt = now;
          }
        }
        for (const draft of drafts) {
          const fingerprint = fingerprintOf(customer.externalId, draft);
          const existing = data.findings.find((finding) => finding.fingerprint === fingerprint);
          if (existing) {
            const nextStatus = existing.status === "resolved" ? "open" : existing.status;
            Object.assign(existing, draftFields(draft), { status: nextStatus, updatedAt: now });
            continue;
          }
          data.findings.push(toFinding(customerId, customer.externalId, draft, now));
        }
        customer.lastAuditAt = run.finishedAt;
        customer.lastAuditError = null;
        data.runs.push({ id: randomUUID(), customerId, ...run });
        await write(data);
        return drafts.length;
      }),
    recordFailure: (customerId, run) =>
      locked(async () => {
        const data = await read();
        const customer = requiredCustomer(data, customerId);
        customer.lastAuditAt = run.finishedAt;
        customer.lastAuditError = run.message;
        data.runs.push({ id: randomUUID(), customerId, ...run });
        await write(data);
      }),
    setDecision: (findingId, action, note) =>
      locked(async () => {
        const data = await read();
        const finding = data.findings.find((item) => item.id === findingId);
        if (!finding) throw new Error("No encontramos el hallazgo.");
        const now = new Date().toISOString();
        finding.status = statusFor(action);
        finding.updatedAt = now;
        data.decisions.push({
          id: randomUUID(),
          findingId,
          action,
          note: note.trim(),
          createdAt: now,
        });
        await write(data);
      }),
    saveInterpretation: (findingId, text, model) =>
      locked(async () => {
        const data = await read();
        const finding = data.findings.find((item) => item.id === findingId);
        if (!finding) throw new Error("No encontramos el hallazgo.");
        finding.interpretation = text;
        finding.interpretationModel = model;
        finding.interpretationAt = new Date().toISOString();
        finding.updatedAt = finding.interpretationAt;
        await write(data);
      }),
  };
}

function requiredCustomer(data: FileData, customerId: string): Customer {
  const customer = data.customers.find((item) => item.id === customerId);
  if (!customer) throw new Error("No encontramos la cuenta.");
  return customer;
}

function applyFilter(findings: Finding[], filter?: FindingFilter): Finding[] {
  return findings
    .filter((finding) => {
      if (filter?.customerId && finding.customerId !== filter.customerId) return false;
      if (filter?.status && filter.status !== "all" && finding.status !== filter.status) return false;
      if (filter?.severity && filter.severity !== "all" && finding.severity !== filter.severity) return false;
      return true;
    })
    .sort((a, b) => rank(a.severity) - rank(b.severity) || b.updatedAt.localeCompare(a.updatedAt));
}

function rank(severity: Finding["severity"]): number {
  return severity === "error" ? 0 : severity === "warning" ? 1 : 2;
}

function statusFor(action: DecisionAction): Finding["status"] {
  if (action === "reopened") return "open";
  return action;
}

function draftFields(draft: FindingDraft) {
  return {
    ruleId: draft.ruleId,
    severity: draft.severity,
    source: draft.source,
    title: draft.title,
    summary: draft.summary,
    suggestion: draft.suggestion,
    entityType: draft.entityType,
    entityId: draft.entityId,
    entityName: draft.entityName,
    campaignName: draft.campaignName,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    metrics: draft.metrics,
    confidence: draft.confidence,
    confidenceReason: draft.confidenceReason,
    impactEstimate: draft.impactEstimate,
    caution: draft.caution,
  };
}

function toFinding(customerId: string, externalId: string, draft: FindingDraft, now: string): Finding {
  return {
    id: randomUUID(),
    customerId,
    fingerprint: fingerprintOf(externalId, draft),
    status: "open",
    interpretation: null,
    interpretationModel: null,
    interpretationAt: null,
    updatedAt: now,
    ...draftFields(draft),
  };
}
