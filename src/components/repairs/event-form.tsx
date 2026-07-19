"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
import { addRepairEvent } from "@/app/(app)/repairs/actions";
import { formatStatusLabel } from "@/components/repairs/status-badge";
import {
  initialRepairState,
  REPAIR_EVENT_STATUSES,
  type RepairActionState,
  type RepairEventStatus,
} from "@/lib/validators/repair";

export function EventForm({ repairId }: { repairId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState<
    RepairActionState,
    FormData
  >(addRepairEvent, initialRepairState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Status update added.");
      formRef.current?.reset();
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <input type="hidden" name="repair_id" value={repairId} />

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="status">Status</Label>
        <Select name="status" disabled={pending}>
          <SelectTrigger id="status">
            <SelectValue placeholder="Select status" />
          </SelectTrigger>
          <SelectContent>
            {REPAIR_EVENT_STATUSES.map((status: RepairEventStatus) => (
              <SelectItem key={status} value={status}>
                {formatStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" disabled={pending} />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="is_public"
          value="true"
          defaultChecked
          disabled={pending}
          className="size-4 rounded border-input"
        />
        Visible to customer on the status portal
      </label>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add status update"}
        </Button>
      </div>
    </form>
  );
}
