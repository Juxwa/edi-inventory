import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Only for code paths that do their own
// authorization (public repair lookup rate-limiting, admin user management).
// Never import from a client component; env vars are intentionally not
// NEXT_PUBLIC_* so Next.js can never inline them client-side.
export function createAdminClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
