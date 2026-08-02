import "server-only";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBackendAdminEmail } from "@/lib/view-as";

export type BackendAdminUser = {
  id: string;
  email: string;
};

// Gate for the developer-only backend console (e.g. /admin/activity).
// Deliberately separate from the app's admin role: this checks a single
// env-pinned email, not the profiles.role column, so it can't be granted
// by editing a database row.
//
// Note this resolves the identity straight from the auth session, so it is
// unaffected by the view-as overlay in @/lib/supabase/profile — impersonating
// a lower role never locks him out of the backend console.
export async function getBackendAdminUser(): Promise<BackendAdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return null;
  if (!isBackendAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email };
}

export async function isBackendAdmin(): Promise<boolean> {
  return (await getBackendAdminUser()) !== null;
}

export async function requireBackendAdmin(): Promise<void> {
  if (!process.env.BACKEND_ADMIN_EMAIL) notFound();
  if (!(await getBackendAdminUser())) notFound();
}
