"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createService, type PricingActionState } from "@/app/(app)/pricing/actions";

const initialState: PricingActionState = { ok: false };

// Admin-only. Adds a service to the catalog; the new row then appears in the
// pricing table with no price, ready for per-branch pricing on this page.
export function AddServiceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [state, formAction, pending] = useActionState<PricingActionState, FormData>(
    createService,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Service added.");
      setOpen(false);
      setName("");
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
        if (next) setName("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Add service</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add service</DialogTitle>
          <DialogDescription>
            Adds a service to the catalog for all branches. Set each branch&apos;s
            price in the table below after saving.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              name="name"
              value={name}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setName(event.target.value)
              }
              placeholder="e.g. Hearing Aid Cleaning"
              maxLength={200}
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="service-description">Description (optional)</Label>
            <Textarea
              id="service-description"
              name="description"
              rows={3}
              maxLength={1000}
              disabled={pending}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim().length === 0}>
              {pending ? "Adding…" : "Add service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
