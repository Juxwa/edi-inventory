"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  inviteUser,
  updateUserProfile,
  setUserActive,
} from "@/app/(app)/admin/users/actions";
import {
  initialUserState,
  USER_ROLES,
  type UserActionState,
  type UserRole,
} from "@/lib/validators/user";

export type UserRowData = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branch_id: string | null;
  branch_name: string;
  is_active: boolean;
  last_sign_in_at: string | null;
  is_self: boolean;
};

type BranchOption = { id: string; name: string };

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  branch_rep: "Branch Rep",
  top_mgmt: "Top Management",
  technical: "Technical",
};

const NO_BRANCH = "none";

function RoleBranchFields({
  defaultRole,
  defaultBranchId,
  branches,
  disabled,
}: {
  defaultRole?: UserRole;
  defaultBranchId?: string | null;
  branches: BranchOption[];
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <Select name="role" defaultValue={defaultRole} disabled={disabled}>
          <SelectTrigger id="role">
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            {USER_ROLES.map((role: UserRole) => (
              <SelectItem key={role} value={role}>
                {ROLE_LABEL[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="branch_id">Branch</Label>
        <Select
          name="branch_id"
          defaultValue={defaultBranchId ?? NO_BRANCH}
          disabled={disabled}
        >
          <SelectTrigger id="branch_id">
            <SelectValue placeholder="No branch" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_BRANCH}>No branch</SelectItem>
            {branches.map((branch: BranchOption) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function stripNoBranch(formData: FormData) {
  if (formData.get("branch_id") === NO_BRANCH) {
    formData.set("branch_id", "");
  }
}

export function InviteUserDialog({ branches }: { branches: BranchOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    inviteUser,
    initialUserState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Invitation sent.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon className="size-4" />
          Invite user
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
        </DialogHeader>
        <form
          action={(formData: FormData) => {
            stripNoBranch(formData);
            formAction(formData);
          }}
          className="grid gap-4"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" required disabled={pending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" name="name" required disabled={pending} />
          </div>
          <RoleBranchFields branches={branches} disabled={pending} />
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending..." : "Send invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({
  user,
  branches,
}: {
  user: UserRowData;
  branches: BranchOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    updateUserProfile,
    initialUserState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("User updated.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {user.email}</DialogTitle>
        </DialogHeader>
        <form
          action={(formData: FormData) => {
            stripNoBranch(formData);
            formAction(formData);
          }}
          className="grid gap-4"
        >
          <input type="hidden" name="user_id" value={user.id} />
          <div className="grid gap-1.5">
            <Label htmlFor="edit-name">Name</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={user.name}
              required
              disabled={pending}
            />
          </div>
          <RoleBranchFields
            defaultRole={user.role}
            defaultBranchId={user.branch_id}
            branches={branches}
            disabled={pending}
          />
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActiveToggle({ user }: { user: UserRowData }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<UserActionState, FormData>(
    setUserActive,
    initialUserState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("User updated.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (user.is_self) return null;

  return (
    <form
      action={formAction}
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        if (
          user.is_active &&
          !window.confirm(
            `Deactivate ${user.email}? They will be signed out and blocked from signing in.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="user_id" value={user.id} />
      <input type="hidden" name="active" value={user.is_active ? "false" : "true"} />
      <Button
        type="submit"
        size="sm"
        variant={user.is_active ? "destructive" : "secondary"}
        disabled={pending}
      >
        {pending ? "..." : user.is_active ? "Deactivate" : "Reactivate"}
      </Button>
    </form>
  );
}

function formatLastSignIn(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UserTable({
  rows,
  branches,
}: {
  rows: UserRowData[];
  branches: BranchOption[];
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last sign-in</TableHead>
            <TableHead className="w-40" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((user: UserRowData) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{ROLE_LABEL[user.role]}</TableCell>
              <TableCell>{user.branch_name}</TableCell>
              <TableCell>
                {user.is_active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="outline">Deactivated</Badge>
                )}
              </TableCell>
              <TableCell>{formatLastSignIn(user.last_sign_in_at)}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-2">
                  <EditUserDialog user={user} branches={branches} />
                  <ActiveToggle user={user} />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
