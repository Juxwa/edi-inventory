"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import { parseSerials } from "@/lib/serials";
import { submitIntake } from "@/app/(app)/inventory/intake/actions";
import {
  initialIntakeState,
  type IntakeActionState,
} from "@/lib/validators/intake";

export type IntakeProductOption = {
  id: string;
  name: string;
  code: string | null;
  has_serial: boolean;
  supplier_id: string | null;
};

export type IntakeBranchOption = {
  id: string;
  name: string;
};

export type IntakeSupplierOption = {
  id: string;
  name: string;
};

type IntakeFormProps = {
  products: IntakeProductOption[];
  branches: IntakeBranchOption[];
  suppliers: IntakeSupplierOption[];
  defaultBranchId?: string | null;
};

function ProductPicker({
  products,
  selectedId,
  onSelect,
}: {
  products: IntakeProductOption[];
  selectedId: string | null;
  onSelect: (product: IntakeProductOption) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) return products;
    return products.filter((product: IntakeProductOption) => {
      const name = product.name.toLowerCase();
      const code = product.code?.toLowerCase() ?? "";
      return name.includes(trimmed) || code.includes(trimmed);
    });
  }, [products, query]);

  const selected = products.find(
    (product: IntakeProductOption) => product.id === selectedId,
  );

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="product-search">Product</Label>
      <Input
        id="product-search"
        placeholder="Type to filter by name or code"
        value={query}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setQuery(event.target.value)
        }
      />
      {selected ? (
        <p className="text-sm text-muted-foreground">
          Selected: <span className="font-medium text-foreground">{selected.name}</span>
          {selected.code ? ` (${selected.code})` : ""}
        </p>
      ) : null}
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No products match.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {filtered.slice(0, 100).map((product: IntakeProductOption) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onSelect(product)}
                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                    product.id === selectedId
                      ? "bg-accent text-accent-foreground"
                      : ""
                  }`}
                >
                  <span className="font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {product.code ?? "No code"}
                    {product.has_serial ? " · Serialized" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function IntakeForm({
  products,
  branches,
  suppliers,
  defaultBranchId,
}: IntakeFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    IntakeActionState,
    FormData
  >(submitIntake, initialIntakeState);

  const [selectedProduct, setSelectedProduct] =
    useState<IntakeProductOption | null>(null);
  const [supplierId, setSupplierId] = useState<string>("");
  const [serialsText, setSerialsText] = useState("");

  useEffect(() => {
    if (state.ok) {
      toast.success(`${state.count ?? 0} units received.`);
      setSelectedProduct(null);
      setSupplierId("");
      setSerialsText("");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  const serialCount = useMemo(() => parseSerials(serialsText).length, [
    serialsText,
  ]);
  const rawLineCount = useMemo(
    () => serialsText.split(/\r?\n/).filter((line: string) => line.trim().length > 0).length,
    [serialsText],
  );
  const hasDuplicates = rawLineCount > serialCount;

  function handleProductSelect(product: IntakeProductOption) {
    setSelectedProduct(product);
    if (product.supplier_id) {
      setSupplierId(product.supplier_id);
    }
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="product_id" value={selectedProduct?.id ?? ""} />
      <input
        type="hidden"
        name="has_serial"
        value={selectedProduct?.has_serial ? "on" : ""}
      />

      <ProductPicker
        products={products}
        selectedId={selectedProduct?.id ?? null}
        onSelect={handleProductSelect}
      />

      {selectedProduct?.has_serial ? (
        <div className="grid gap-1.5">
          <Label htmlFor="serials_text">Serial numbers (one per line)</Label>
          <textarea
            id="serials_text"
            name="serials_text"
            rows={8}
            disabled={pending}
            value={serialsText}
            onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
              setSerialsText(event.target.value)
            }
            placeholder={"SN-0001\nSN-0002\nSN-0003"}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="text-sm text-muted-foreground">
            {serialCount} serial{serialCount === 1 ? "" : "s"} will be received.
            {hasDuplicates ? (
              <span className="ml-1 font-medium text-warning-foreground">
                Duplicate lines were removed.
              </span>
            ) : null}
          </p>
          <p className="text-sm text-muted-foreground">
            Duplicate serials are ignored; serials already in stock will be
            rejected.
          </p>
        </div>
      ) : (
        <div className="grid gap-1.5 sm:w-64">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="1"
            disabled={pending || !selectedProduct}
            required={!selectedProduct?.has_serial}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="branch_id">Branch</Label>
          <Select
            name="branch_id"
            disabled={pending}
            defaultValue={defaultBranchId ?? undefined}
          >
            <SelectTrigger id="branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: IntakeBranchOption) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
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
            value={supplierId || undefined}
            onValueChange={setSupplierId}
          >
            <SelectTrigger id="supplier_id">
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((supplier: IntakeSupplierOption) => (
                <SelectItem key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cost_per_unit">Cost per unit</Label>
          <Input
            id="cost_per_unit"
            name="cost_per_unit"
            type="number"
            min="0"
            step="0.01"
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invoice_no">Invoice no.</Label>
          <Input id="invoice_no" name="invoice_no" disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="invoice_date">Invoice date</Label>
          <Input
            id="invoice_date"
            name="invoice_date"
            type="date"
            disabled={pending}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="expiry_date">Expiry date (optional)</Label>
          <Input
            id="expiry_date"
            name="expiry_date"
            type="date"
            disabled={pending}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            name="repair_pool"
            disabled={pending}
            className="size-4 rounded border-input"
          />
          Repair pool
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-medium">
          <input
            type="checkbox"
            name="office_asset"
            disabled={pending}
            className="size-4 rounded border-input"
          />
          Office asset
        </label>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || !selectedProduct}>
          {pending ? "Receiving..." : "Receive stock"}
        </Button>
      </div>
    </form>
  );
}
