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
import { requestSaleReturn } from "@/app/(app)/approvals/actions";
import {
  initialRequestState,
  type RequestActionState,
} from "@/lib/validators/correction-request";

// Returns are not applied directly: this files a return REQUEST with a
// reason, and head office approves or rejects it on the Approvals page.
export function ReturnDialog({
  saleId,
  lineId,
  itemLabel,
  remainingQuantity,
}: {
  saleId: string;
  lineId: string;
  itemLabel: string;
  remainingQuantity: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(String(remainingQuantity));
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<
    RequestActionState,
    FormData
  >(requestSaleReturn, initialRequestState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Return request sent for HQ approval.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) {
          setQuantity(String(remainingQuantity));
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Request return
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a return</DialogTitle>
          <DialogDescription>
            {itemLabel}. Stock is restored only after head office approves.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="sale_id" value={saleId} />
          <input type="hidden" name="line_id" value={lineId} />

          <div className="grid gap-1.5">
            <Label htmlFor="quantity">Quantity to return</Label>
            <Input
              id="quantity"
              name="quantity"
              type="number"
              min="1"
              max={remainingQuantity}
              step="1"
              value={quantity}
              disabled={pending}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setQuantity(event.target.value)
              }
            />
            <p className="text-xs text-muted-foreground">
              Remaining quantity: {remainingQuantity}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="reason">Reason (required)</Label>
            <textarea
              id="reason"
              name="reason"
              rows={3}
              required
              disabled={pending}
              value={reason}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReason(event.target.value)
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Reason for return"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Sending..." : "Send request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
