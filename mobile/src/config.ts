export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? ""; // guard:allow-env-credential — Native deploy configuration, public Supabase endpoint only.
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""; // guard:allow-env-credential — Intentionally public publishable key; JWT and RLS enforce authorization.
export const supabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);
export const evidenceBucket = "pmr-evidence";
export const maxFixAgeSeconds = 120;
export const maxAccuracyMeters = 50;
export const siteRadiusMeters = 250;
