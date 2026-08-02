import "server-only";
import { cookies } from "next/headers";

// Backend-admin "view as" impersonation. App-layer only: it overlays the
// role/branch the app *gates* on, it does NOT change the database session.
// RLS keeps running as his real admin profile — that's deliberate, and safe,
// because admin's RLS reach is a superset of every role below it, so every
// impersonated screen still renders. It also means writes made while
// impersonating are still stamped with his real auth.uid() (sale_record's
// sold_by, activity_log.actor_id, admin_corrections.actor_id), which is
// exactly what we want: the audit trail must name the human, not the costume.
export const VIEW_AS_COOKIE = "edi-view-as";

// Impersonation targets. 'admin' is deliberately absent: he already is an
// admin, so overlaying it would be a confusing no-op. Keeping the union
// closed to these three is also what guarantees the overlay can only ever
// NARROW capability — admin is a superset of all three.
export const VIEW_AS_ROLES = ["branch_rep", "top_mgmt", "technical"] as const;
export type ViewAsRole = (typeof VIEW_AS_ROLES)[number];

export type ViewAs = {
  role: ViewAsRole;
  branchId: string | null;
};

export const VIEW_AS_ROLE_LABEL: Record<ViewAsRole, string> = {
  branch_rep: "Branch Rep",
  top_mgmt: "Top Management",
  technical: "Technical",
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isViewAsRole(value: string): value is ViewAsRole {
  return (VIEW_AS_ROLES as readonly string[]).includes(value);
}

// Env-pinned email check, same rule as requireBackendAdmin() — kept here as a
// pure function so it can be applied to a user object already in hand without
// a second auth.getUser() round trip.
export function isBackendAdminEmail(email: string | null | undefined): boolean {
  const configured = process.env.BACKEND_ADMIN_EMAIL;
  if (!configured || !email) return false;
  return email.toLowerCase() === configured.toLowerCase();
}

export function parseBranchId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

export function encodeViewAs(role: ViewAsRole, branchId: string | null): string {
  return branchId === null ? role : `${role}:${branchId}`;
}

// The cookie is untrusted input: only a known role literal and a well-formed
// uuid ever survive. Anything else decodes to null (= not impersonating).
function decodeViewAs(raw: string | undefined): ViewAs | null {
  if (!raw) return null;
  const separator = raw.indexOf(":");
  const role = separator === -1 ? raw : raw.slice(0, separator);
  const rawBranch = separator === -1 ? "" : raw.slice(separator + 1);
  if (!isViewAsRole(role)) return null;
  if (rawBranch.length > 0 && parseBranchId(rawBranch) === null) return null;
  return { role, branchId: parseBranchId(rawBranch) };
}

// Two independent gates, both re-checked on every request:
//   1. the session's real email is the env-pinned backend admin, and
//   2. the real profile row is already role 'admin'.
// Only then is the cookie consulted. A non-backend-admin who somehow carries
// the cookie gets nothing; a backend admin whose real role were ever demoted
// gets nothing either, so the overlay can never widen access.
export async function getActiveViewAs(
  email: string | null | undefined,
  realRole: string,
): Promise<ViewAs | null> {
  if (!isBackendAdminEmail(email)) return null;
  if (realRole !== "admin") return null;
  const cookieStore = await cookies();
  return decodeViewAs(cookieStore.get(VIEW_AS_COOKIE)?.value);
}
