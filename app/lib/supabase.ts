import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PROJECT_URL = "https://gzjikifzdmfkrvxcixlw.supabase.co";

export const EVIDENCE_BUCKET = "pmr-evidence";

const url = import.meta.env.VITE_SUPABASE_URL || PROJECT_URL;
const publishableKey: string | undefined =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || undefined;

export const supabaseConfigured = Boolean(publishableKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!publishableKey) {
    throw new Error("Supabase is not configured.");
  }
  client ??= createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
