import { generateText, Output } from "ai";
import { z } from "zod";
import type { FindingDraft } from "@/lib/audit/types";

const narrativeSchema = z.object({
  explanation: z.string().min(40).max(700),
});

export function collectAllowedNumbers(parts: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const part of parts) {
    for (const token of part.match(/\d[\d.,]*/g) ?? []) {
      allowed.add(token);
      allowed.add(token.replaceAll(".", ""));
      allowed.add(token.replaceAll(".", "").replace(",", "."));
      allowed.add(token.replaceAll(",", ""));
    }
  }
  return allowed;
}

export function unknownFigures(narrative: string, allowed: Set<string>): string[] {
  const unknown: string[] = [];
  for (const token of narrative.match(/\d[\d.,]*/g) ?? []) {
    if (token.length < 2 && !token.includes(",") && !token.includes(".")) continue;
    const variants = [
      token,
      token.replaceAll(".", ""),
      token.replaceAll(".", "").replace(",", "."),
      token.replaceAll(",", ""),
    ];
    if (!variants.some((variant) => allowed.has(variant))) unknown.push(token);
  }
  return unknown;
}

export function evidenceCorpus(draft: Pick<FindingDraft, "summary" | "suggestion" | "metrics" | "impactEstimate" | "periodStart" | "periodEnd">): string[] {
  return [
    draft.summary,
    draft.suggestion,
    draft.impactEstimate ?? "",
    draft.periodStart,
    draft.periodEnd,
    "14",
    ...draft.metrics.flatMap((metric) => [metric.label, metric.value]),
  ];
}

export async function interpretFinding(draft: FindingDraft): Promise<{ text: string; model: string }> {
  const model = process.env.AI_MODEL || "openai/gpt-5.4";
  const corpus = evidenceCorpus(draft);
  const { output } = await generateText({
    model,
    output: Output.object({ schema: narrativeSchema }),
    instructions:
      "Explicás hallazgos de una auditoría de Google Ads ya calculada. No inventes causas, pronósticos ni cifras. No recomiendes aplicar automáticamente una sugerencia de Google. Escribí en español rioplatense, en un párrafo.",
    prompt: `Usá solamente estas cifras y estos hechos. Si una cifra no está en la lista, no la menciones.

${corpus.filter(Boolean).join("\n")}

El hallazgo ya está diagnosticado. Parafraseá la evidencia y la sugerencia. No agregues un diagnóstico nuevo.`,
  });
  if (!output) throw new Error("El modelo no devolvió una explicación.");
  const unknown = unknownFigures(output.explanation, collectAllowedNumbers(corpus));
  if (unknown.length > 0) {
    throw new Error(`La explicación citó cifras que no están en la evidencia: ${unknown.join(", ")}.`);
  }
  return { text: output.explanation, model };
}
