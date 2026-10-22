import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createFileStore } from "@/lib/store/file-store";
import { createSupabaseStore } from "@/lib/store/supabase-store";
import type { AuditorStore } from "@/lib/store/types";

let store: AuditorStore | null = null;

export function getStore(): AuditorStore {
  if (store) return store;
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && secret) {
    const client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    store = createSupabaseStore(client);
    return store;
  }
  store = createFileStore(path.join(process.cwd(), ".data", "store.json"));
  return store;
}

export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function usingSupabase(): boolean {
  return Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY));
}
