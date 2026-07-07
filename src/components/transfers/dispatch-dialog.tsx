"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { dispatchTransfer } from "@/app/(app)/transfers/actions";
import {
  initialTransferState,
  type TransferActionState,
} from "@/lib/validators/transfer";

export function DispatchDialog({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(dispatchTransfer, initialTransferState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Transfer dispatched.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Dispatch</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dispatch transfer</DialogTitle>
          <DialogDescription>
            Record courier details for this shipment.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="transfer_id" value={transferId} />

          <div className="grid gap-1.5">
            <Label htmlFor="courier">Courier</Label>
            <Input id="courier" name="courier" required disabled={pending} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="tracking_code">Tracking code (optional)</Label>
            <Input id="tracking_code" name="tracking_code" disabled={pending} />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sis_no">SIS no. (optional)</Label>
            <Input id="sis_no" name="sis_no" disabled={pending} />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Dispatching..." : "Dispatch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
