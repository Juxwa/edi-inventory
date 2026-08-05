import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// PKCE callback: Supabase's default email links land here with ?code=...;
// exchanging it (with the code-verifier cookie set when the flow started)
// establishes the session, then we forward to the intended page.
// Companion to /auth/confirm, which handles token_hash-style links.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";

  // Only allow same-app relative redirects.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(safeNext);
    }
  }

  redirect(
    "/login?error=" +
      encodeURIComponent(
        "That link expired or was opened in a different browser. Request a new one.",
      ),
  );
}
