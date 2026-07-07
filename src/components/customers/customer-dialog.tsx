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
  createCustomer,
  updateCustomer,
} from "@/app/(app)/customers/actions";
import {
  initialCustomerState,
  type CustomerActionState,
} from "@/lib/validators/customer";

export type CustomerRecord = {
  id: string;
  name: string;
  mobile_no: string | null;
  email: string | null;
  address: string | null;
  date_of_birth: string | null;
};

function CustomerFormFields({
  customer,
  pending,
}: {
  customer?: CustomerRecord;
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
          defaultValue={customer?.name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="mobile_no">Mobile no.</Label>
          <Input
            id="mobile_no"
            name="mobile_no"
            disabled={pending}
            defaultValue={customer?.mobile_no ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            disabled={pending}
            defaultValue={customer?.email ?? ""}
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
          defaultValue={customer?.address ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="date_of_birth">Date of birth</Label>
        <Input
          id="date_of_birth"
          name="date_of_birth"
          type="date"
          disabled={pending}
          defaultValue={customer?.date_of_birth ?? ""}
        />
      </div>
    </>
  );
}

export function CustomerCreateDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    CustomerActionState,
    FormData
  >(createCustomer, initialCustomerState);

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
          <DialogTitle>New customer</DialogTitle>
          <DialogDescription>Add a customer record.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <CustomerFormFields pending={pending} />

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Create customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerEditDialog({
  open,
  onOpenChange,
  customer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerRecord;
}) {
  const [state, formAction, pending] = useActionState<
    CustomerActionState,
    FormData
  >(updateCustomer, initialCustomerState);

  useEffect(() => {
    if (state.ok) {
      onOpenChange(false);
    }
  }, [state.ok, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit customer</DialogTitle>
          <DialogDescription>Update customer details.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={customer.id} />
          <CustomerFormFields customer={customer} pending={pending} />

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
