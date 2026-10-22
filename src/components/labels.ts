import type { Severity } from "@/lib/audit/types";
import type { FindingStatus } from "@/lib/store/types";

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Aviso",
  opportunity: "Oportunidad",
};

export const STATUS_LABEL: Record<FindingStatus, string> = {
  open: "Abierto",
  accepted: "Para hacer",
  dismissed: "Descartado",
  done: "Hecho",
  resolved: "Resuelto",
};

export function confidenceLabel(value: number): string {
  if (value >= 0.8) return "Alta";
  if (value >= 0.55) return "Media";
  return "Baja";
}
