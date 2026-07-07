"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { reserveTransfer, deleteDraft } from "@/app/(app)/transfers/actions";
import {
  initialTransferState,
  type TransferActionState,
} from "@/lib/validators/transfer";

export function ReserveButton({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(reserveTransfer, initialTransferState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Transfer reserved.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="transfer_id" value={transferId} />
      <Button type="submit" disabled={pending}>
        {pending ? "Reserving..." : "Reserve"}
      </Button>
    </form>
  );
}

export function DeleteDraftButton({ transferId }: { transferId: string }) {
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(deleteDraft, initialTransferState);

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        if (!window.confirm("Delete this draft transfer? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="transfer_id" value={transferId} />
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Deleting..." : "Delete draft"}
      </Button>
    </form>
  );
}
