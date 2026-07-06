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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProduct,
  updateProduct,
  type ProductActionState,
} from "@/app/(app)/products/actions";

export type ProductCategoryOption = {
  id: number;
  name: string;
};

export type SupplierOption = {
  id: string;
  name: string;
};

export type ProductRecord = {
  id: string;
  name: string;
  code: string | null;
  category_id: number | null;
  supplier_id: string | null;
  srp: number | null;
  has_serial: boolean;
  description: string | null;
  notes: string | null;
  is_active: boolean;
};

const initialState: ProductActionState = { ok: false };

function ProductFormFields({
  categories,
  suppliers,
  product,
  pending,
}: {
  categories: ProductCategoryOption[];
  suppliers: SupplierOption[];
  product?: ProductRecord;
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
          defaultValue={product?.name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="code">Code</Label>
          <Input
            id="code"
            name="code"
            disabled={pending}
            defaultValue={product?.code ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="srp">SRP</Label>
          <Input
            id="srp"
            name="srp"
            type="number"
            step="0.01"
            min="0"
            disabled={pending}
            defaultValue={product?.srp ?? ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="category_id">Category</Label>
          <Select
            name="category_id"
            disabled={pending}
            defaultValue={
              product?.category_id != null
                ? String(product.category_id)
                : undefined
            }
          >
            <SelectTrigger id="category_id">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem key={category.id} value={String(category.id)}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="supplier_id">Supplier</Label>
          <Select
            name="supplier_id"
            disabled={pending}
            defaultValue={product?.supplier_id ?? undefined}
          >
            <SelectTrigger id="supplier_id">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((supplier) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="description">Description</Label>
        <textarea
          id="description"
          name="description"
          rows={2}
          disabled={pending}
          defaultValue={product?.description ?? ""}
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
          defaultValue={product?.notes ?? ""}
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="has_serial"
            disabled={pending}
            defaultChecked={product?.has_serial ?? false}
            className="size-4 rounded border-input"
          />
          Has serial numbers
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_active"
            disabled={pending}
            defaultChecked={product?.is_active ?? true}
            className="size-4 rounded border-input"
          />
          Active
        </label>
      </div>
    </>
  );
}

export function ProductCreateDialog({
  categories,
  suppliers,
  trigger,
}: {
  categories: ProductCategoryOption[];
  suppliers: SupplierOption[];
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    createProduct,
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
          <DialogTitle>New product</DialogTitle>
          <DialogDescription>Add a product to the catalog.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <ProductFormFields
            categories={categories}
            suppliers={suppliers}
            pending={pending}
          />

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Create product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductEditDialog({
  open,
  onOpenChange,
  categories,
  suppliers,
  product,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ProductCategoryOption[];
  suppliers: SupplierOption[];
  product: ProductRecord;
}) {
  const [state, formAction, pending] = useActionState(
    updateProduct,
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
          <DialogTitle>Edit product</DialogTitle>
          <DialogDescription>Update product details.</DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={product.id} />
          <ProductFormFields
            categories={categories}
            suppliers={suppliers}
            product={product}
            pending={pending}
          />

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
