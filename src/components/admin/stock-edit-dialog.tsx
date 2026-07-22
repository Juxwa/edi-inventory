"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import { editStock } from "@/app/(app)/admin/corrections/actions";
import {
  initialCorrectionState,
  type CorrectionActionState,
} from "@/lib/validators/correction";

export type StockEditProductOption = {
  id: string;
  name: string;
  code: string | null;
};

// Admin-only affordance next to a stock row's Void intake action. Opens a
// dialog to fix mis-keyed product/model or invoice data without voiding
// the intake — see stock_edit RPC (0025_stock_edit.sql). Cannot change
// serial (use SerialCorrectDialog) or quantity (would desync the movement
// ledger).
export function StockEditDialog({
  stockId,
  currentProductId,
  currentProductLabel,
  products,
  costPerUnit,
  invoiceNo,
  invoiceDate,
  expiryDate,
  isRepairPool,
  isOfficeAsset,
}: {
  stockId: string;
  currentProductId: string;
  currentProductLabel: string;
  products: StockEditProductOption[];
  costPerUnit: number | null;
  invoiceNo: string | null;
  invoiceDate: string | null;
  expiryDate: string | null;
  isRepairPool: boolean;
  isOfficeAsset: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [productId, setProductId] = useState(currentProductId);
  const [productQuery, setProductQuery] = useState("");
  const [state, formAction, pending] = useActionState<
    CorrectionActionState,
    FormData
  >(editStock, initialCorrectionState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Stock updated.");
      setOpen(false);
      setReason("");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const filteredProducts = useMemo(() => {
    const trimmed = productQuery.trim().toLowerCase();
    if (trimmed.length === 0) return products;
    return products.filter((product: StockEditProductOption) => {
      const name = product.name.toLowerCase();
      const code = product.code?.toLowerCase() ?? "";
      return name.includes(trimmed) || code.includes(trimmed);
    });
  }, [products, productQuery]);

  const selectedProduct = products.find(
    (product: StockEditProductOption) => product.id === productId,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) {
          setProductId(currentProductId);
          setProductQuery("");
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PencilIcon className="size-3.5" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit stock details</DialogTitle>
          <DialogDescription>
            Currently: {currentProductLabel}. Fixes the product/model or
            invoice data recorded at intake. Serial and quantity cannot be
            changed here.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="stock_id" value={stockId} />
          <input type="hidden" name="product_id" value={productId} />

          <div className="grid gap-1.5">
            <Label htmlFor="stock-edit-product-search">Product</Label>
            <Input
              id="stock-edit-product-search"
              placeholder="Type to filter by name or code"
              value={productQuery}
              disabled={pending}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setProductQuery(event.target.value)
              }
            />
            {selectedProduct ? (
              <p className="text-sm text-muted-foreground">
                Selected:{" "}
                <span className="font-medium text-foreground">
                  {selectedProduct.name}
                </span>
                {selectedProduct.code ? ` (${selectedProduct.code})` : ""}
              </p>
            ) : null}
            <div className="max-h-40 overflow-y-auto rounded-md border border-border">
              {filteredProducts.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  No products match.
                </p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {filteredProducts.slice(0, 100).map((product: StockEditProductOption) => (
                    <li key={product.id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setProductId(product.id)}
                        className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                          product.id === productId
                            ? "bg-accent text-accent-foreground"
                            : ""
                        }`}
                      >
                        <span className="font-medium">{product.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {product.code ?? "No code"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="stock-edit-cost">Cost per unit</Label>
              <Input
                id="stock-edit-cost"
                name="cost_per_unit"
                type="number"
                min="0"
                step="0.01"
                defaultValue={costPerUnit ?? ""}
                disabled={pending}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-edit-invoice-no">Invoice no.</Label>
              <Input
                id="stock-edit-invoice-no"
                name="invoice_no"
                defaultValue={invoiceNo ?? ""}
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="stock-edit-invoice-date">Invoice date</Label>
              <Input
                id="stock-edit-invoice-date"
                name="invoice_date"
                type="date"
                defaultValue={invoiceDate ?? ""}
                disabled={pending}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="stock-edit-expiry">Expiry date (optional)</Label>
              <Input
                id="stock-edit-expiry"
                name="expiry_date"
                type="date"
                defaultValue={expiryDate ?? ""}
                disabled={pending}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                name="is_repair_pool"
                defaultChecked={isRepairPool}
                disabled={pending}
                className="size-4 rounded border-input"
              />
              Repair pool
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                name="is_office_asset"
                defaultChecked={isOfficeAsset}
                disabled={pending}
                className="size-4 rounded border-input"
              />
              Office asset
            </label>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="stock-edit-reason">Reason (required)</Label>
            <textarea
              id="stock-edit-reason"
              name="reason"
              rows={2}
              required
              disabled={pending}
              value={reason}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReason(event.target.value)
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Why is this stock row being corrected?"
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
              disabled={pending || reason.trim().length === 0 || !productId}
            >
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
