import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GOOGLE_ADS_SCOPE, googleConfigured } from "@/lib/google-ads/client";

export async function GET(request: Request) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL("/conectar?error=faltan-credenciales", request.url));
  }
  const state = randomBytes(24).toString("hex");
  const jar = await cookies();
  jar.set("gads_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || new URL("/api/google/callback", request.url).toString();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${GOOGLE_ADS_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
