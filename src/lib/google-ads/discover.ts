import type { GoogleAdsClient } from "@/lib/google-ads/client";

export type DiscoveredAccount = {
  externalId: string;
  name: string;
  currencyCode: string;
  timeZone: string;
  access: "mcc" | "direct";
  loginCustomerId: string | null;
  manager: boolean;
};

type CustomerRow = {
  customer?: {
    id?: string | number;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
    status?: string;
  };
  customerClient?: {
    id?: string | number;
    descriptiveName?: string;
    currencyCode?: string;
    timeZone?: string;
    manager?: boolean;
    status?: string;
    level?: string | number;
  };
};

function idOf(value: string | number | undefined): string {
  return String(value ?? "").replaceAll("-", "");
}

export async function discoverAccounts(
  client: GoogleAdsClient,
): Promise<{ accounts: DiscoveredAccount[]; skipped: string[] }> {
  const payload = (await client.get("/customers:listAccessibleCustomers")) as {
    resourceNames?: string[];
  };
  const accessible = (payload.resourceNames ?? [])
    .map((name) => name.split("/")[1])
    .filter((id): id is string => Boolean(id));

  const discovered: DiscoveredAccount[] = [];
  const skipped: string[] = [];
  for (const customerId of accessible) {
    try {
      const [row] = (await client.search(
        customerId,
        `SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer LIMIT 1`,
      )) as CustomerRow[];
      const customer = row?.customer;
      if (!customer) {
        skipped.push(`${customerId}: Google Ads no devolvió la cuenta.`);
        continue;
      }
      if (customer.manager) {
        const children = (await client.search(
          customerId,
          `SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level, customer_client.test_account, customer_client.hidden FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status = 'ENABLED' AND customer_client.level >= 1 AND customer_client.test_account = FALSE AND customer_client.hidden = FALSE`,
        )) as CustomerRow[];
        for (const child of children) {
          const clientAccount = child.customerClient;
          if (!clientAccount?.id) continue;
          discovered.push({
            externalId: idOf(clientAccount.id),
            name: clientAccount.descriptiveName || `Cuenta ${clientAccount.id}`,
            currencyCode: clientAccount.currencyCode || "USD",
            timeZone: clientAccount.timeZone || "America/Argentina/Buenos_Aires",
            access: "mcc",
            loginCustomerId: customerId,
            manager: false,
          });
        }
        continue;
      }
      discovered.push({
        externalId: idOf(customer.id ?? customerId),
        name: customer.descriptiveName || `Cuenta ${customerId}`,
        currencyCode: customer.currencyCode || "USD",
        timeZone: customer.timeZone || "America/Argentina/Buenos_Aires",
        access: "direct",
        loginCustomerId: null,
        manager: false,
      });
    } catch (error) {
      skipped.push(`${customerId}: ${error instanceof Error ? error.message : "no se pudo leer"}`);
    }
  }
  return { accounts: dedupeAccounts(discovered), skipped };
}

function dedupeAccounts(accounts: DiscoveredAccount[]): DiscoveredAccount[] {
  const byId = new Map<string, DiscoveredAccount>();
  for (const account of accounts) {
    const current = byId.get(account.externalId);
    if (!current || (account.access === "mcc" && current.access !== "mcc")) {
      byId.set(account.externalId, account);
    }
  }
  return [...byId.values()];
}

export function accessMode(accounts: DiscoveredAccount[]): "mcc" | "direct" | "mixed" {
  const modes = new Set(accounts.map((account) => account.access));
  if (modes.size > 1) return "mixed";
  if (modes.has("mcc")) return "mcc";
  return "direct";
}
