import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const GATE_COOKIE = "gads_gate";

export function passwordRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function expectedToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac("sha256", password).update("gads-session").digest("hex");
}

export async function hasAccess(): Promise<boolean> {
  const expected = expectedToken();
  if (!expected) return true;
  const current = (await cookies()).get(GATE_COOKIE)?.value;
  if (!current || current.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(current), Buffer.from(expected));
}

export async function grantAccess(password: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  const sameLength = password.length === expected.length;
  const left = Buffer.from(password);
  const right = Buffer.from(sameLength ? expected : password);
  const matches = sameLength && timingSafeEqual(left, right);
  if (!matches) return false;
  const token = expectedToken();
  if (!token) return false;
  (await cookies()).set(GATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return true;
}
