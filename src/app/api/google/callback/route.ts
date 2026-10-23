import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GoogleAdsClient } from "@/lib/google-ads/client";
import { accessMode, discoverAccounts } from "@/lib/google-ads/discover";
import { getStore } from "@/lib/store";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const expected = jar.get("gads_oauth_state")?.value;
  jar.delete("gads_oauth_state");
  if (!code || !state || !expected || state !== expected) {
    return NextResponse.redirect(new URL("/conectar?error=estado-invalido", request.url));
  }

  const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL("/api/google/callback", request.url).toString();
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const token = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (!tokenResponse.ok || !token.access_token || !token.refresh_token) {
    const reason = token.refresh_token ? token.error ?? "token" : "sin-refresh-token";
    return NextResponse.redirect(new URL(`/conectar?error=${encodeURIComponent(reason)}`, request.url));
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  const profile = (await profileResponse.json()) as { email?: string };
  const discovery = await discoverAccounts(new GoogleAdsClient(token.access_token));
  if (discovery.accounts.length === 0) {
    const reason = discovery.skipped[0] ?? "sin-cuentas";
    return NextResponse.redirect(new URL(`/conectar?error=${encodeURIComponent(reason)}`, request.url));
  }
  const store = getStore();
  await store.ensureReady();
  await store.saveConnection({
    googleEmail: profile.email || "cuenta de Google",
    accessMode: accessMode(discovery.accounts),
    refreshToken: token.refresh_token,
    customers: discovery.accounts.map((account) => ({
      externalId: account.externalId,
      name: account.name,
      currencyCode: account.currencyCode,
      timeZone: account.timeZone,
      access: account.access,
      loginCustomerId: account.loginCustomerId,
    })),
  });
  const next = new URL("/cuentas?conectada=1", request.url);
  if (discovery.skipped.length > 0) {
    const count = discovery.skipped.length;
    const lead = count === 1 ? "Se omitió 1 cuenta." : `Se omitieron ${count} cuentas.`;
    next.searchParams.set("aviso", `${lead} ${discovery.skipped[0]}`);
  }
  return NextResponse.redirect(next);
}
