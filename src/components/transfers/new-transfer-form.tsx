"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTransfer } from "@/app/(app)/transfers/actions";
import {
  initialTransferState,
  type TransferActionState,
} from "@/lib/validators/transfer";

export type BranchOption = {
  id: string;
  name: string;
};

type NewTransferFormProps = {
  branches: BranchOption[];
  lockedFromBranchId: string | null;
};

export function NewTransferForm({
  branches,
  lockedFromBranchId,
}: NewTransferFormProps) {
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(createTransfer, initialTransferState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const lockedBranch = branches.find(
    (branch: BranchOption) => branch.id === lockedFromBranchId,
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="from_branch_id">From branch</Label>
        {lockedFromBranchId ? (
          <>
            <input
              type="hidden"
              name="from_branch_id"
              value={lockedFromBranchId}
            />
            <p className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {lockedBranch?.name ?? "Your branch"}
            </p>
          </>
        ) : (
          <Select name="from_branch_id" disabled={pending}>
            <SelectTrigger id="from_branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: BranchOption) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="to_branch_id">To branch</Label>
        <Select name="to_branch_id" disabled={pending}>
          <SelectTrigger id="to_branch_id">
            <SelectValue placeholder="Select branch" />
          </SelectTrigger>
          <SelectContent>
            {branches.map((branch: BranchOption) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating..." : "Create draft"}
        </Button>
      </div>
    </form>
  );
}
