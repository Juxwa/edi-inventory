"use client";

import { useActionState, useEffect, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { serveRequest } from "@/app/(app)/requests/actions";
import {
  initialRequestState,
  type RequestActionState,
} from "@/lib/validators/request";

export type ServeBranchOption = {
  id: string;
  name: string;
};

export function ServeDialog({
  requestId,
  branches,
  excludeBranchId,
}: {
  requestId: string;
  branches: ServeBranchOption[];
  excludeBranchId: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    RequestActionState,
    FormData
  >(serveRequest, initialRequestState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const fromBranchOptions = branches.filter(
    (branch: ServeBranchOption) => branch.id !== excludeBranchId,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Serve request</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Serve request</DialogTitle>
          <DialogDescription>
            Choose the branch to fulfil this request from. A draft transfer
            will be created and linked to this request.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="request_id" value={requestId} />

          <div className="grid gap-1.5">
            <Label htmlFor="from_branch_id">From branch</Label>
            <Select name="from_branch_id" disabled={pending}>
              <SelectTrigger id="from_branch_id">
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {fromBranchOptions.map((branch: ServeBranchOption) => (
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

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Serving..." : "Serve"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
