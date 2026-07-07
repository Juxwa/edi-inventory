"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLine, removeLine } from "@/app/(app)/transfers/actions";
import {
  initialTransferState,
  type TransferActionState,
} from "@/lib/validators/transfer";

export function AddLineButton({
  transferId,
  stockId,
  maxQuantity,
  isSerialized,
}: {
  transferId: string;
  stockId: string;
  maxQuantity: number;
  isSerialized: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(addLine, initialTransferState);
  const [quantity, setQuantity] = useState<string>(String(maxQuantity));

  useEffect(() => {
    if (state.ok) {
      toast.success("Line added.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="transfer_id" value={transferId} />
      <input type="hidden" name="stock_id" value={stockId} />
      {isSerialized ? (
        <input type="hidden" name="quantity" value="1" />
      ) : (
        <Input
          type="number"
          name="quantity"
          min="1"
          max={maxQuantity}
          step="1"
          value={quantity}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
            setQuantity(event.target.value)
          }
          disabled={pending}
          className="h-8 w-20"
        />
      )}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding..." : "Add"}
      </Button>
    </form>
  );
}

export function RemoveLineButton({
  transferId,
  lineId,
}: {
  transferId: string;
  lineId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    TransferActionState,
    FormData
  >(removeLine, initialTransferState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Line removed.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      <input type="hidden" name="transfer_id" value={transferId} />
      <input type="hidden" name="line_id" value={lineId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Remove
      </Button>
    </form>
  );
}
