"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

const TEMP_PASSWORD = "edi2026";

// Single server action for the forced password change. It changes the password
// AND clears must_change_password in one authenticated call, in that order, so
// the flag can never be cleared without a real password rotation (the old
// two-step flow exposed a standalone flag-clear the client could call directly)
// and a failed clear is surfaced instead of silently leaving the account in a
// changed-password/flag-still-set limbo.
export async function changePasswordAndClearFlag(
  password: string,
): Promise<ChangePasswordResult> {
  // Server-side validation — the client's identical checks are only for fast
  // feedback and cannot be trusted here.
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password === TEMP_PASSWORD) {
    return {
      ok: false,
      error: "Choose a password different from your temporary password.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      error: "Your session has expired. Request a new link and try again.",
    };
  }

  // Change the password on the caller's OWN session — no user id crosses the
  // wire, so there is no IDOR surface.
  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    return {
      ok: false,
      error:
        updateError.message ||
        "Could not set the password. The link may have expired — request a new one.",
    };
  }

  // Only now that the password actually changed do we clear the flag, via the
  // service-role client (bypasses RLS). If this fails — e.g. SUPABASE_URL /
  // SERVICE_ROLE_KEY unset — we report it rather than proceeding: the flag
  // stays true, the layout keeps redirecting here, and the user can retry with
  // a new password (or an admin can clear it), instead of a silent lockout.
  const admin = createAdminClient();
  const { error: flagError } = await admin
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);
  if (flagError) {
    return {
      ok: false,
      error:
        "Your password was updated but finalizing your account failed. Please try again, or contact an administrator if it keeps failing.",
    };
  }

  // Navigate server-side rather than returning and letting the client router.push.
  // updateUser above rotated the session; the server client wrote the new auth
  // cookies (server.ts setAll), and this redirect response carries them as fresh
  // Set-Cookie while navigating atomically. That avoids the production hang where
  // a client-side updateUser rotated the token and a soft router.push then raced
  // against the stale client session and never advanced. redirect() throws
  // NEXT_REDIRECT, so it must stay outside any try/catch — there is none here.
  redirect("/");
}
