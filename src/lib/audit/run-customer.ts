import { auditAccount } from "@/lib/audit/engine";
import { demoAccount } from "@/lib/audit/demo";
import { GoogleAdsClient, refreshAccessToken } from "@/lib/google-ads/client";
import { loadAuditAccount } from "@/lib/google-ads/sync";
import { getStore } from "@/lib/store";

export async function auditStoredCustomer(customerId: string): Promise<void> {
  const store = getStore();
  await store.ensureReady();
  const customer = await store.getCustomer(customerId);
  if (!customer) throw new Error("No encontramos la cuenta.");
  const startedAt = new Date().toISOString();
  try {
    let operationCount = 0;
    let message: string | null = customer.isDemo ? "Cuenta de muestra. Los datos no salen de Google Ads." : null;
    const drafts = customer.isDemo
      ? auditAccount(demoAccount())
      : await (async () => {
          const connection = (await store.listConnections()).find((item) => item.id === customer.connectionId);
          if (!connection) throw new Error("La cuenta no tiene una conexión de Google.");
          const accessToken = await refreshAccessToken(connection.refreshToken);
          const client = new GoogleAdsClient(accessToken);
          const loaded = await loadAuditAccount(client, customer);
          operationCount = client.operations;
          if (loaded.notes.length > 0) message = loaded.notes.join(" ");
          return auditAccount(loaded.account);
        })();
    await store.applyAudit(customer.id, drafts, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "ok",
      findingCount: drafts.length,
      operationCount,
      message,
    });
  } catch (error) {
    const text = error instanceof Error ? error.message : "Falló la auditoría.";
    await store.recordFailure(customer.id, {
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "error",
      findingCount: 0,
      operationCount: 0,
      message: text,
    });
    throw error;
  }
}

export async function auditConnectedCustomers(): Promise<{ audited: number; failed: number }> {
  const store = getStore();
  await store.ensureReady();
  const customers = (await store.listCustomers()).filter((customer) => !customer.isDemo);
  let failed = 0;
  for (const customer of customers) {
    try {
      await auditStoredCustomer(customer.id);
    } catch {
      failed += 1;
    }
  }
  return { audited: customers.length - failed, failed };
}
