"use client";

import { useActionState, useEffect, useState } from "react";
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
import {
  createSupplier,
  updateSupplier,
  type SupplierActionState,
} from "@/app/(app)/suppliers/actions";

export type SupplierRecord = {
  id: string;
  name: string;
  contact_person: string | null;
  contact_no: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  notes: string | null;
  is_active: boolean;
};

const initialState: SupplierActionState = { ok: false };

function SupplierFormFields({
  supplier,
  pending,
}: {
  supplier?: SupplierRecord;
  pending: boolean;
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          disabled={pending}
          defaultValue={supplier?.name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="contact_person">Contact person</Label>
          <Input
            id="contact_person"
            name="contact_person"
            disabled={pending}
            defaultValue={supplier?.contact_person ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="contact_no">Contact number</Label>
          <Input
            id="contact_no"
            name="contact_no"
            disabled={pending}
            defaultValue={supplier?.contact_no ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            disabled={pending}
            defaultValue={supplier?.email ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="payment_terms">Payment terms</Label>
          <Input
            id="payment_terms"
            name="payment_terms"
            disabled={pending}
            defaultValue={supplier?.payment_terms ?? ""}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="address">Address</Label>
        <textarea
          id="address"
          name="address"
          rows={2}
          disabled={pending}
          defaultValue={supplier?.address ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          disabled={pending}
          defaultValue={supplier?.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          name="is_active"
          disabled={pending}
          defaultChecked={supplier?.is_active ?? true}
          className="size-4 rounded border-input"
        />
        Active
      </label>
    </>
  );
}

export function SupplierCreateDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createSupplier,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
    }
  }, [state.ok]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New supplier</DialogTitle>
          <DialogDescription>Add a supplier record.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <SupplierFormFields pending={pending} />

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Create supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierEditDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  supplier: SupplierRecord;
}) {
  const [state, formAction, pending] = useActionState(
    updateSupplier,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
    }
  }, [state.ok, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit supplier</DialogTitle>
          <DialogDescription>Update supplier details.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={supplier.id} />
          <SupplierFormFields supplier={supplier} pending={pending} />

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
