"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";
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
import { correctSerial } from "@/app/(app)/admin/corrections/actions";
import {
  initialCorrectionState,
  type CorrectionActionState,
  type SerialCorrectScope,
} from "@/lib/validators/correction";

// Admin-only pencil affordance next to a serial value. Opens a dialog
// requiring the new serial and a reason before submit unlocks. Used on
// stock rows, sale lines, transfer lines, and repair detail.
export function SerialCorrectDialog({
  scope,
  id,
  currentSerial,
  returnPath,
}: {
  scope: SerialCorrectScope;
  id: string;
  currentSerial: string | null;
  returnPath?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newSerial, setNewSerial] = useState(currentSerial ?? "");
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<
    CorrectionActionState,
    FormData
  >(correctSerial, initialCorrectionState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Serial corrected.");
      setOpen(false);
      setReason("");
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
          setNewSerial(currentSerial ?? "");
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          aria-label="Correct serial"
        >
          <PencilIcon className="size-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Correct serial number</DialogTitle>
          <DialogDescription>
            Current: {currentSerial ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="scope" value={scope} />
          <input type="hidden" name="id" value={id} />
          {returnPath ? (
            <input type="hidden" name="return_path" value={returnPath} />
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="new_serial">New serial</Label>
            <Input
              id="new_serial"
              name="new_serial"
              required
              disabled={pending}
              value={newSerial}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setNewSerial(event.target.value)
              }
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="serial-reason">Reason (required)</Label>
            <textarea
              id="serial-reason"
              name="reason"
              rows={2}
              required
              disabled={pending}
              value={reason}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReason(event.target.value)
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Why is this serial being corrected?"
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
              disabled={
                pending ||
                reason.trim().length === 0 ||
                newSerial.trim().length === 0
              }
            >
              {pending ? "Saving..." : "Save correction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
