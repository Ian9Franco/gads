import { describe, expect, it } from "vitest";
import { GoogleAdsClient, googleAdsErrorMessage } from "@/lib/google-ads/client";
import { discoverAccounts } from "@/lib/google-ads/discover";
import { assertReadOnly, ReadOnlyViolation } from "@/lib/google-ads/read-only";

describe("cliente de solo lectura", () => {
  it("permite consultar y bloquea mutaciones", () => {
    expect(() => assertReadOnly("GET", "/customers:listAccessibleCustomers")).not.toThrow();
    expect(() => assertReadOnly("POST", "/customers/1234567890/googleAds:search")).not.toThrow();
    expect(() => assertReadOnly("POST", "/customers/1234567890/googleAds:mutate")).toThrow(ReadOnlyViolation);
    expect(() => assertReadOnly("POST", "/customers/1234567890/campaignBudgets:mutate")).toThrow(ReadOnlyViolation);
  });

  it("descubre clientes de una MCC y cuentas con invitación directa", async () => {
    const requests: { url: string; login?: string | null }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      requests.push({ url, login: headers.get("login-customer-id") });
      const path = new URL(url).pathname;
      if (path.endsWith(":listAccessibleCustomers")) {
        return json({ resourceNames: ["customers/1111111111", "customers/2222222222"] });
      }
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (path.includes("/customers/1111111111/") && body.query.includes("FROM customer_client")) {
        return json({
          results: [
            {
              customerClient: {
                id: "3333333333",
                descriptiveName: "Cliente bajo MCC",
                currencyCode: "ARS",
                timeZone: "America/Argentina/Buenos_Aires",
                manager: false,
                status: "ENABLED",
                level: 1,
              },
            },
          ],
        });
      }
      if (path.includes("/customers/1111111111/")) {
        return json({
          results: [{ customer: { id: "1111111111", descriptiveName: "MCC Fanger", manager: true, currencyCode: "ARS", timeZone: "America/Argentina/Buenos_Aires" } }],
        });
      }
      return json({
        results: [{ customer: { id: "2222222222", descriptiveName: "Invitación directa", manager: false, currencyCode: "ARS", timeZone: "America/Argentina/Buenos_Aires" } }],
      });
    };

    const { accounts, skipped } = await discoverAccounts(new GoogleAdsClient("token", fetchImpl));
    expect(skipped).toEqual([]);
    expect(accounts).toEqual([
      expect.objectContaining({ externalId: "3333333333", access: "mcc", loginCustomerId: "1111111111" }),
      expect.objectContaining({ externalId: "2222222222", access: "direct", loginCustomerId: null }),
    ]);
    expect(accounts.some((account) => account.externalId === "1111111111")).toBe(false);
    expect(requests.some((request) => request.login === "1111111111")).toBe(false);
  });

  it("sigue con el resto si una cuenta accesible falla y prioriza el acceso MCC", async () => {
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith(":listAccessibleCustomers")) {
        return json({ resourceNames: ["customers/1111111111", "customers/9999999999", "customers/3333333333"] });
      }
      const body = JSON.parse(String(init?.body)) as { query: string };
      if (path.includes("/customers/9999999999/")) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Request contains an invalid argument.",
              details: [{ errors: [{ message: "User doesn't have permission to access customer." }] }],
            },
          }),
          { status: 403 },
        );
      }
      if (path.includes("/customers/1111111111/") && body.query.includes("FROM customer_client")) {
        return json({
          results: [
            {
              customerClient: {
                id: "3333333333",
                descriptiveName: "Cliente",
                currencyCode: "ARS",
                timeZone: "America/Argentina/Buenos_Aires",
                manager: false,
                status: "ENABLED",
                level: 1,
                testAccount: false,
                hidden: false,
              },
            },
          ],
        });
      }
      if (path.includes("/customers/1111111111/")) {
        return json({
          results: [{ customer: { id: "1111111111", descriptiveName: "MCC", manager: true, currencyCode: "ARS", timeZone: "America/Argentina/Buenos_Aires" } }],
        });
      }
      return json({
        results: [{ customer: { id: "3333333333", descriptiveName: "Cliente directo", manager: false, currencyCode: "ARS", timeZone: "America/Argentina/Buenos_Aires" } }],
      });
    };

    const { accounts, skipped } = await discoverAccounts(new GoogleAdsClient("token", fetchImpl));
    expect(skipped).toEqual(["9999999999: User doesn't have permission to access customer."]);
    expect(accounts).toEqual([
      expect.objectContaining({ externalId: "3333333333", access: "mcc", loginCustomerId: "1111111111" }),
    ]);
  });

  it("muestra el detalle de Google Ads y no solo el mensaje genérico", () => {
    expect(
      googleAdsErrorMessage(
        {
          error: {
            message: "Request contains an invalid argument.",
            details: [{ errors: [{ message: "Cannot select search_budget_lost_impression_share." }] }],
          },
        },
        400,
      ),
    ).toBe("Cannot select search_budget_lost_impression_share.");
  });
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}
