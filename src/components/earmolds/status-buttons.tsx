"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { advanceEarmold } from "@/app/(app)/earmolds/actions";
import {
  initialEarmoldState,
  type EarmoldActionState,
  type EarmoldStatus,
} from "@/lib/validators/earmold";

const TRANSITIONS: Partial<
  Record<EarmoldStatus, { to: EarmoldStatus; label: string; pendingLabel: string }>
> = {
  pending: { to: "processing", label: "Start processing", pendingLabel: "Starting..." },
  processing: { to: "served", label: "Mark served", pendingLabel: "Marking..." },
};

export function EarmoldStatusButton({
  earmoldId,
  status,
}: {
  earmoldId: string;
  status: EarmoldStatus;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    EarmoldActionState,
    FormData
  >(advanceEarmold, initialEarmoldState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Status updated.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const transition = TRANSITIONS[status];
  if (!transition) return null;

  return (
    <form action={formAction}>
      <input type="hidden" name="earmold_id" value={earmoldId} />
      <input type="hidden" name="from_status" value={status} />
      <input type="hidden" name="to_status" value={transition.to} />
      <Button type="submit" disabled={pending}>
        {pending ? transition.pendingLabel : transition.label}
      </Button>
    </form>
  );
}
