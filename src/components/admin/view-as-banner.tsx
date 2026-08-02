import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { setViewAs, clearViewAs } from "@/app/(app)/admin/view-as/actions";
import {
  VIEW_AS_ROLES,
  VIEW_AS_ROLE_LABEL,
  type ViewAs,
  type ViewAsRole,
} from "@/lib/view-as";

type BranchOption = {
  id: string;
  name: string;
};

// Rendered by the (app) layout for the backend admin only, on every page, so
// an impersonated session is impossible to forget about. Plain form elements
// and server actions — no client bundle, and it still works with JS off.
export async function ViewAsBanner({ viewAs }: { viewAs: ViewAs | null }) {
  const admin = createAdminClient();
  const { data } = await admin.from("branches").select("id, name").order("name");
  const branches: BranchOption[] = (data as BranchOption[] | null) ?? [];

  const activeBranch = viewAs?.branchId
    ? (branches.find((branch: BranchOption) => branch.id === viewAs.branchId) ??
      null)
    : null;

  const impersonating = viewAs !== null;

  return (
    <div
      className={
        impersonating
          ? "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-sm text-amber-950 print:hidden dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          : "flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-muted/40 px-4 py-2 text-sm text-muted-foreground print:hidden"
      }
    >
      <span className="font-medium">
        {impersonating && viewAs ? (
          <>
            Viewing as {VIEW_AS_ROLE_LABEL[viewAs.role]}
            {activeBranch ? ` — ${activeBranch.name}` : ""}
          </>
        ) : (
          "Backend admin"
        )}
      </span>

      <form action={setViewAs} className="flex flex-wrap items-center gap-2">
        <label htmlFor="view-as-branch" className="text-xs">
          Branch
        </label>
        <select
          id="view-as-branch"
          name="branch_id"
          defaultValue={viewAs?.branchId ?? ""}
          className="h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground"
        >
          <option value="">Keep my own branch</option>
          {branches.map((branch: BranchOption) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        {VIEW_AS_ROLES.map((role: ViewAsRole) => (
          <button
            key={role}
            type="submit"
            name="role"
            value={role}
            aria-pressed={viewAs?.role === role}
            className={
              viewAs?.role === role
                ? "h-7 rounded-md bg-foreground px-2.5 text-xs font-medium text-background"
                : "h-7 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
            }
          >
            {VIEW_AS_ROLE_LABEL[role]}
          </button>
        ))}
      </form>

      {impersonating ? (
        <form action={clearViewAs}>
          <button
            type="submit"
            className="h-7 rounded-md border border-amber-500 bg-amber-200 px-2.5 text-xs font-semibold text-amber-950 hover:bg-amber-300 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-50"
          >
            Exit view-as
          </button>
        </form>
      ) : null}

      <span className="ml-auto flex items-center gap-3 text-xs">
        <Link href="/admin/activity" className="underline underline-offset-2">
          Activity log
        </Link>
        <Link href="/admin/edit" className="underline underline-offset-2">
          Data editor
        </Link>
      </span>
    </div>
  );
}
