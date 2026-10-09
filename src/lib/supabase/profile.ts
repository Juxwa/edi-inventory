import { createClient } from "./server";
import {
  getActiveViewAs,
  isBackendAdminEmail,
  type ViewAs,
} from "@/lib/view-as";

// Role exactly as stored on profiles.role (user_role enum).
export type DbRole =
  | "admin"
  | "branch_rep"
  | "top_mgmt"
  | "technical"
  | "hq_staff"
  | "supervisor";

// Who may decide correction requests (migration 0062): the HQ supervisor
// decides everything; HQ staff decide requests filed by branches.
export type ApproverTier = "hq_staff" | "supervisor";

export type Profile = {
  id: string;
  name: string | null;
  // EFFECTIVE role. hq_staff is reported as "branch_rep" — HQ staff work as
  // a branch rep of the head-office branch everywhere in the app, exactly as
  // auth_role() reports them in the database — and carry approver below.
  // "supervisor" is approvals-only: it appears in no page/nav allowlist.
  role: "admin" | "branch_rep" | "top_mgmt" | "technical" | "supervisor";
  branch_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  // Non-null when this user can decide correction requests.
  approver: ApproverTier | null;
};

type ProfileRow = Omit<Profile, "role" | "approver"> & { role: DbRole };

export type ProfileContext = {
  // Effective profile: the real row with the view-as overlay applied.
  profile: Profile | null;
  // Role on the real profiles row, before any overlay.
  realRole: Profile["role"] | null;
  // Non-null only while the backend admin is impersonating.
  viewAs: ViewAs | null;
  // True when the session email matches BACKEND_ADMIN_EMAIL.
  isBackendAdmin: boolean;
};

const EMPTY_CONTEXT: ProfileContext = {
  profile: null,
  realRole: null,
  viewAs: null,
  isBackendAdmin: false,
};

// Resolves the session's profile and applies the backend admin's view-as
// overlay. Every page, server action and route handler in the app reaches
// identity through here (via getProfile), so overlaying once at this point is
// what makes nav, page gates and action guards all agree on the impersonated
// role without touching a single call site.
//
// Only role and branch_id are overlaid. is_active and must_change_password
// stay the REAL values so the (app) layout's account checks can never be
// faked by a cookie, and id stays real so writes keep naming the real human.
export async function getProfileContext(): Promise<ProfileContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return EMPTY_CONTEXT;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const row = data as ProfileRow | null;
  const backendAdmin = isBackendAdminEmail(user.email);
  if (!row) return { ...EMPTY_CONTEXT, isBackendAdmin: backendAdmin };

  let approver: ApproverTier | null = null;
  if (row.role === "supervisor") {
    approver = "supervisor";
  } else if (row.role === "hq_staff" && row.branch_id) {
    // HQ staff only approve while assigned to the head-office branch
    // (mirrors auth_approver_tier()).
    const { data: branch } = await supabase
      .from("branches")
      .select("is_head_office")
      .eq("id", row.branch_id)
      .single();
    if (branch?.is_head_office === true) approver = "hq_staff";
  }

  const real: Profile = {
    ...row,
    role: row.role === "hq_staff" ? "branch_rep" : row.role,
    approver,
  };

  const viewAs = await getActiveViewAs(user.email, real.role);
  if (!viewAs) {
    return {
      profile: real,
      realRole: real.role,
      viewAs: null,
      isBackendAdmin: backendAdmin,
    };
  }

  return {
    profile: {
      ...real,
      role: viewAs.role,
      branch_id: viewAs.branchId ?? real.branch_id,
      // Impersonation is for looking around, not for deciding requests.
      approver: null,
    },
    realRole: real.role,
    viewAs,
    isBackendAdmin: backendAdmin,
  };
}

export async function getProfile(): Promise<Profile | null> {
  const { profile } = await getProfileContext();
  return profile;
}

export async function getBranchName(
  branchId: string | null,
): Promise<string | null> {
  if (!branchId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("branches")
    .select("name")
    .eq("id", branchId)
    .single();
  return data?.name ?? null;
}
