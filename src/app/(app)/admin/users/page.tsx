import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  UserTable,
  type UserRowData,
  InviteUserDialog,
} from "@/components/admin/user-table";
import type { UserRole } from "@/lib/validators/user";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  name: string;
  role: UserRole;
  branch_id: string | null;
  is_active: boolean;
};

export default async function AdminUsersPage() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    redirect("/");
  }

  const supabase = await createClient();
  const admin = createAdminClient();

  const [profilesResult, branchesResult, usersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, name, role, branch_id, is_active")
      .order("name"),
    supabase.from("branches").select("id, name, is_active").order("name"),
    // Auth emails + last sign-in live in auth.users, only reachable via the
    // admin API. ponytail: single page of 1000 covers this team's size.
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const profiles: ProfileRow[] = (profilesResult.data as ProfileRow[] | null) ?? [];
  // All branches (including closed ones) feed the name lookup below, so a
  // user already assigned to a closed branch still shows its name. Only
  // active branches are offered in the assignment dropdown further down.
  const allBranches: { id: string; name: string; is_active: boolean }[] =
    branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    allBranches.map((branch: { id: string; name: string; is_active: boolean }) => [
      branch.id,
      branch.name,
    ]),
  );
  const branches: { id: string; name: string }[] = allBranches
    .filter((branch: { id: string; name: string; is_active: boolean }) => branch.is_active)
    .map((branch: { id: string; name: string; is_active: boolean }) => ({
      id: branch.id,
      name: branch.name,
    }));

  type AuthUser = { id: string; email?: string; last_sign_in_at?: string };
  const authById = new Map<string, AuthUser>(
    ((usersResult.data?.users as AuthUser[] | undefined) ?? []).map(
      (user: AuthUser) => [user.id, user],
    ),
  );

  const rows: UserRowData[] = profiles.map((row: ProfileRow) => ({
    id: row.id,
    name: row.name,
    email: authById.get(row.id)?.email ?? "—",
    role: row.role,
    branch_id: row.branch_id,
    branch_name: row.branch_id
      ? (branchNameById.get(row.branch_id) ?? "—")
      : "—",
    is_active: row.is_active,
    last_sign_in_at: authById.get(row.id)?.last_sign_in_at ?? null,
    is_self: row.id === profile.id,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Invite staff, assign roles and branches, and deactivate accounts.
          </p>
        </div>
        <InviteUserDialog branches={branches} />
      </div>

      <UserTable rows={rows} branches={branches} />
    </div>
  );
}
