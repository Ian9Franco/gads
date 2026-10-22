import { describe, expect, it } from "vitest";
import { evidenceCorpus, unknownFigures, collectAllowedNumbers } from "@/lib/audit/narrative";
import { auditAccount } from "@/lib/audit/engine";
import { demoAccount } from "@/lib/audit/demo";

describe("explicaciones ancladas a la evidencia", () => {
  const finding = auditAccount(demoAccount()).find((item) => item.ruleId === "keyword_spend_without_conversions");
  if (!finding) throw new Error("falta el hallazgo de muestra");
  const allowed = collectAllowedNumbers(evidenceCorpus(finding));

  it("acepta una paráfrasis que usa las cifras del hallazgo", () => {
    expect(unknownFigures("La palabra gastó $ 35.000 en 14 días y tuvo 48 clics.", allowed)).toEqual([]);
  });

  it("rechaza una cifra que no está en la evidencia", () => {
    expect(unknownFigures("Podrías ahorrar 99.999 pesos el mes que viene.", allowed)).toContain("99.999");
  });
});
