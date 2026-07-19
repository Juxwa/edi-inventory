"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createEarmold } from "@/app/(app)/earmolds/actions";
import {
  initialEarmoldState,
  EAR_SIDES,
  type EarmoldActionState,
  type EarSide,
} from "@/lib/validators/earmold";

export function EarmoldForm({
  branches,
  lockedBranchId,
}: {
  branches: { id: string; name: string }[];
  lockedBranchId: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    EarmoldActionState,
    FormData
  >(createEarmold, initialEarmoldState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const lockedBranch = branches.find(
    (branch: { id: string; name: string }) => branch.id === lockedBranchId,
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="branch_id">Branch</Label>
        {lockedBranchId ? (
          <>
            <input type="hidden" name="branch_id" value={lockedBranchId} />
            <p className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {lockedBranch?.name ?? "Your branch"}
            </p>
          </>
        ) : (
          <Select name="branch_id" disabled={pending}>
            <SelectTrigger id="branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: { id: string; name: string }) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="patient_name">Patient name</Label>
          <Input id="patient_name" name="patient_name" disabled={pending} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contact_no">Contact no. (optional)</Label>
          <Input id="contact_no" name="contact_no" disabled={pending} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address">Address (optional)</Label>
        <Input id="address" name="address" disabled={pending} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="hearing_aid_model">Hearing aid model (optional)</Label>
          <Input id="hearing_aid_model" name="hearing_aid_model" disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="side">Side (optional)</Label>
          <Select name="side" disabled={pending}>
            <SelectTrigger id="side">
              <SelectValue placeholder="Select side" />
            </SelectTrigger>
            <SelectContent>
              {EAR_SIDES.map((side: EarSide) => (
                <SelectItem key={side} value={side} className="capitalize">
                  {side.charAt(0).toUpperCase() + side.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="serial_no">Serial no. (optional)</Label>
          <Input id="serial_no" name="serial_no" disabled={pending} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="remarks">Remarks (optional)</Label>
        <textarea
          id="remarks"
          name="remarks"
          rows={3}
          disabled={pending}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting..." : "Submit earmold request"}
        </Button>
      </div>
    </form>
  );
}
