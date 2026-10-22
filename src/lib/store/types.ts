import type { EvidenceMetric, FindingSource, Severity } from "@/lib/audit/types";
import type { FindingDraft } from "@/lib/audit/types";

export type DecisionAction = "accepted" | "dismissed" | "done" | "reopened";

export type FindingStatus = "open" | "accepted" | "dismissed" | "done" | "resolved";

export type Customer = {
  id: string;
  externalId: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  isDemo: boolean;
  access: "mcc" | "direct" | "demo";
  loginCustomerId: string | null;
  connectionId: string | null;
  lastAuditAt: string | null;
  lastAuditError: string | null;
};

export type Connection = {
  id: string;
  googleEmail: string;
  accessMode: "mcc" | "direct" | "mixed";
  refreshToken: string;
  createdAt: string;
};

export type Finding = {
  id: string;
  customerId: string;
  fingerprint: string;
  ruleId: string;
  severity: Severity;
  status: FindingStatus;
  source: FindingSource;
  title: string;
  summary: string;
  suggestion: string;
  entityType: string;
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
  interpretation: string | null;
  interpretationModel: string | null;
  interpretationAt: string | null;
  updatedAt: string;
};

export type Decision = {
  id: string;
  findingId: string;
  action: DecisionAction;
  note: string;
  createdAt: string;
};

export type AuditRun = {
  id: string;
  customerId: string;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "error";
  findingCount: number;
  operationCount: number;
  message: string | null;
};

export type FindingFilter = {
  customerId?: string;
  status?: FindingStatus | "all";
  severity?: Severity | "all";
};

export interface AuditorStore {
  ensureReady(): Promise<void>;
  listCustomers(): Promise<Customer[]>;
  getCustomer(id: string): Promise<Customer | null>;
  listFindings(filter?: FindingFilter): Promise<Finding[]>;
  getFinding(id: string): Promise<Finding | null>;
  listDecisions(findingId: string): Promise<Decision[]>;
  listRuns(customerId?: string): Promise<AuditRun[]>;
  listConnections(): Promise<Connection[]>;
  saveConnection(input: {
    googleEmail: string;
    accessMode: Connection["accessMode"];
    refreshToken: string;
    customers: Array<Omit<Customer, "id" | "connectionId" | "lastAuditAt" | "lastAuditError" | "isDemo"> & { isDemo?: boolean }>;
  }): Promise<Connection>;
  applyAudit(customerId: string, drafts: FindingDraft[], run: Omit<AuditRun, "id" | "customerId">): Promise<number>;
  recordFailure(customerId: string, run: Omit<AuditRun, "id" | "customerId">): Promise<void>;
  setDecision(findingId: string, action: DecisionAction, note: string): Promise<void>;
  saveInterpretation(findingId: string, text: string, model: string): Promise<void>;
}

export function fingerprintOf(customerExternalId: string, draft: FindingDraft): string {
  return `${customerExternalId}:${draft.ruleId}:${draft.entityId}:${draft.periodEnd}`;
}
