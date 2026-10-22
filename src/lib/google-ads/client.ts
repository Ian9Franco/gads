import { assertReadOnly } from "@/lib/google-ads/read-only";

export const GOOGLE_ADS_API_VERSION = "v26";
export const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class GoogleAdsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null,
  ) {
    super(message);
    this.name = "GoogleAdsError";
  }
}

export class GoogleAdsClient {
  operations = 0;

  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly operationCap = 400,
  ) {}

  async get(path: string, loginCustomerId?: string | null): Promise<unknown> {
    return this.request("GET", path, undefined, loginCustomerId);
  }

  async search(
    customerId: string,
    query: string,
    loginCustomerId?: string | null,
  ): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const body: { query: string; pageToken?: string } = { query };
      if (pageToken) body.pageToken = pageToken;
      const payload = (await this.request(
        "POST",
        `/customers/${customerId}/googleAds:search`,
        body,
        loginCustomerId,
      )) as { results?: Record<string, unknown>[]; nextPageToken?: string };
      rows.push(...(payload.results ?? []));
      if (!payload.nextPageToken) break;
      pageToken = payload.nextPageToken;
    }
    return rows;
  }

  private async request(
    method: string,
    path: string,
    body: unknown,
    loginCustomerId?: string | null,
  ): Promise<unknown> {
    assertReadOnly(method, path);
    if (this.operations >= this.operationCap) {
      throw new GoogleAdsError(
        `Se alcanzó el tope de ${this.operationCap} operaciones de esta corrida para no consumir la cuota diaria.`,
        429,
        null,
      );
    }
    this.operations += 1;
    const headers = new Headers({
      Authorization: `Bearer ${this.accessToken}`,
      "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    });
    if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers.delete("developer-token");
    if (loginCustomerId) headers.set("login-customer-id", loginCustomerId.replaceAll("-", ""));
    if (body !== undefined) headers.set("Content-Type", "application/json");

    const response = await this.fetchImpl(
      `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}${path}`,
      {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const requestId = response.headers.get("request-id");
    const text = await response.text();
    const payload = text ? safeJson(text) : {};
    if (!response.ok) {
      const message = googleErrorMessage(payload) ?? `Google Ads respondió ${response.status}.`;
      throw new GoogleAdsError(message, response.status, requestId);
    }
    return payload;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text };
  }
}

function googleErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: string } }).error;
  return error?.message ?? null;
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.");
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const response = await fetch("https://www.googleapis.com/oauth2/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const payload = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error ?? "No se pudo renovar el acceso a Google Ads.");
  }
  return payload.access_token;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
