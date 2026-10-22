import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditAccount } from "@/lib/audit/engine";
import { demoAccount } from "@/lib/audit/demo";
import { createFileStore } from "@/lib/store/file-store";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("historial de decisiones", () => {
  it("guarda la decisión sin borrar la evidencia y cierra lo que ya no aparece", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gads-"));
    directories.push(directory);
    const store = createFileStore(path.join(directory, "store.json"));
    await store.ensureReady();
    const [customer] = await store.listCustomers();
    const findings = await store.listFindings({ customerId: customer.id, status: "open" });
    const keyword = findings.find((finding) => finding.ruleId === "keyword_spend_without_conversions");
    if (!keyword) throw new Error("falta el hallazgo");
    await store.setDecision(keyword.id, "dismissed", "La landing estaba rota.");
    const updated = await store.getFinding(keyword.id);
    expect(updated?.status).toBe("dismissed");
    expect(updated?.summary).toContain("35.000");
    expect(await store.listDecisions(keyword.id)).toEqual([
      expect.objectContaining({ action: "dismissed", note: "La landing estaba rota." }),
    ]);

    const remaining = auditAccount(demoAccount()).filter((draft) => draft.ruleId !== "keyword_spend_without_conversions");
    const now = new Date().toISOString();
    await store.applyAudit(customer.id, remaining, {
      startedAt: now,
      finishedAt: now,
      status: "ok",
      findingCount: remaining.length,
      operationCount: 0,
      message: null,
    });
    const kept = await store.getFinding(keyword.id);
    expect(kept?.status).toBe("dismissed");
  });
});
