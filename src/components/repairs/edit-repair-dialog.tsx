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
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateRepair } from "@/app/(app)/repairs/actions";
import { initialRepairState, type RepairActionState } from "@/lib/validators/repair";

const UNASSIGNED = "unassigned";

export function EditRepairDialog({
  repairId,
  assignedTo,
  downpayment,
  remarks,
  isForReplacement,
  technicians,
}: {
  repairId: string;
  assignedTo: string | null;
  downpayment: number | null;
  remarks: string | null;
  isForReplacement: boolean;
  technicians: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    RepairActionState,
    FormData
  >(updateRepair, initialRepairState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Repair updated.");
      setOpen(false);
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit repair</DialogTitle>
        </DialogHeader>

        <form
          action={(formData: FormData) => {
            if (formData.get("assigned_to") === UNASSIGNED) {
              formData.set("assigned_to", "");
            }
            formAction(formData);
          }}
          className="grid gap-4"
        >
          <input type="hidden" name="repair_id" value={repairId} />

          <div className="grid gap-1.5">
            <Label htmlFor="edit-assigned-to">Technician</Label>
            <Select
              name="assigned_to"
              defaultValue={assignedTo ?? UNASSIGNED}
              disabled={pending}
            >
              <SelectTrigger id="edit-assigned-to">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                {technicians.map((tech: { id: string; name: string }) => (
                  <SelectItem key={tech.id} value={tech.id}>
                    {tech.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-downpayment">Downpayment</Label>
            <Input
              id="edit-downpayment"
              name="downpayment"
              type="number"
              min="0"
              step="0.01"
              defaultValue={downpayment ?? ""}
              disabled={pending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="edit-remarks">Remarks (internal)</Label>
            <textarea
              id="edit-remarks"
              name="remarks"
              rows={3}
              defaultValue={remarks ?? ""}
              disabled={pending}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="for_replacement"
              value="true"
              defaultChecked={isForReplacement}
              disabled={pending}
              className="size-4 rounded border-input"
            />
            Mark for replacement
          </label>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
