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
import {
  initialCorrectionState,
  type CorrectionActionState,
} from "@/lib/validators/correction";

// Generic admin-only "requires a reason" confirmation dialog, shared by
// every void/reverse control (sale, stock intake, transfer, repair,
// earmold). Submit stays disabled until the reason field is non-empty.
export function VoidDialog({
  action,
  hiddenFields,
  triggerLabel,
  title,
  description,
  confirmLabel,
  pendingLabel,
  variant = "destructive",
}: {
  action: (
    prevState: CorrectionActionState,
    formData: FormData,
  ) => Promise<CorrectionActionState>;
  hiddenFields: Record<string, string>;
  triggerLabel: string;
  title: string;
  description?: string;
  confirmLabel: string;
  pendingLabel: string;
  variant?: "destructive" | "outline" | "secondary";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState<
    CorrectionActionState,
    FormData
  >(action, initialCorrectionState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Done.");
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
        if (next) setReason("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant={variant}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          {Object.entries(hiddenFields).map(([name, value]: [string, string]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

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
              placeholder="Why is this being reversed?"
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
              variant={variant}
              disabled={pending || reason.trim().length === 0}
            >
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
