import { createClient } from "./server";

export type Profile = {
  id: string;
  name: string | null;
  role: "admin" | "branch_rep" | "top_mgmt" | "technical";
  branch_id: string | null;
  is_active: boolean;
};

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return data;
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
