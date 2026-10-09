"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { decideRequest, cancelRequest } from "@/app/(app)/approvals/actions";
import {
  initialRequestState,
  type RequestActionState,
} from "@/lib/validators/correction-request";

const TEXTAREA_CLASS =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

// Approve / reject one correction request. Approving applies the void or
// return immediately; rejecting needs a note so the branch knows why.
export function DecisionDialog({
  requestId,
  decision,
  summary,
}: {
  requestId: string;
  decision: "approve" | "reject";
  summary: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, formAction, pending] = useActionState<RequestActionState, FormData>(
    decideRequest,
    initialRequestState,
  );
  const isApprove = decision === "approve";

  useEffect(() => {
    if (state.ok) {
      toast.success(isApprove ? "Request approved and applied." : "Request rejected.");
      // The decided request leaves the pending list on refresh, which
      // unmounts this dialog — no need to close it by hand.
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router, isApprove]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) setNote("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={isApprove ? "default" : "outline"}>
          {isApprove ? "Approve" : "Reject"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isApprove ? "Approve this request?" : "Reject this request?"}</DialogTitle>
          <DialogDescription>
            {summary}.{" "}
            {isApprove
              ? "Stock is restored and the sale is updated as soon as you approve. This cannot be undone."
              : "Nothing changes on the sale."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="request_id" value={requestId} />
          <input type="hidden" name="decision" value={decision} />

          <div className="grid gap-1.5">
            <Label htmlFor={`note-${decision}-${requestId}`}>
              {isApprove ? "Note (optional)" : "Reason for rejecting (required)"}
            </Label>
            <textarea
              id={`note-${decision}-${requestId}`}
              name="note"
              rows={3}
              required={!isApprove}
              disabled={pending}
              value={note}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setNote(event.target.value)
              }
              className={TEXTAREA_CLASS}
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button
              type="submit"
              variant={isApprove ? "default" : "destructive"}
              disabled={pending || (!isApprove && note.trim().length === 0)}
            >
              {pending ? "Saving..." : isApprove ? "Approve and apply" : "Reject request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Lets the requester withdraw their own undecided request.
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<RequestActionState, FormData>(
    cancelRequest,
    initialRequestState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Request cancelled.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="request_id" value={requestId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        {pending ? "Cancelling..." : "Cancel request"}
      </Button>
    </form>
  );
}
