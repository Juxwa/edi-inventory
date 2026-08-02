import { createClient } from "./server";
import {
  getActiveViewAs,
  isBackendAdminEmail,
  type ViewAs,
} from "@/lib/view-as";

export type Profile = {
  id: string;
  name: string | null;
  role: "admin" | "branch_rep" | "top_mgmt" | "technical";
  branch_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
};

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

  const real = data as Profile | null;
  const backendAdmin = isBackendAdminEmail(user.email);
  if (!real) return { ...EMPTY_CONTEXT, isBackendAdmin: backendAdmin };

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
