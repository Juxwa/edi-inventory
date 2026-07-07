"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createRequest } from "@/app/(app)/requests/actions";
import {
  initialRequestState,
  type RequestActionState,
} from "@/lib/validators/request";

export type RequestProductOption = {
  id: string;
  name: string;
  code: string | null;
};

export type RequestBranchOption = {
  id: string;
  name: string;
};

type DraftLine = {
  key: string;
  product_id: string;
  product_name: string;
  quantity: string;
};

function ProductPicker({
  products,
  onSelect,
}: {
  products: RequestProductOption[];
  onSelect: (product: RequestProductOption) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) return products;
    return products.filter((product: RequestProductOption) => {
      const name = product.name.toLowerCase();
      const code = product.code?.toLowerCase() ?? "";
      return name.includes(trimmed) || code.includes(trimmed);
    });
  }, [products, query]);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="product-search">Add a product</Label>
      <Input
        id="product-search"
        placeholder="Type to filter by name or code"
        value={query}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setQuery(event.target.value)
        }
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">No products match.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {filtered.slice(0, 100).map((product: RequestProductOption) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(product);
                    setQuery("");
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
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
  );
}

let nextLineKey = 0;

export function NewRequestForm({
  products,
  branches,
  lockedBranchId,
}: {
  products: RequestProductOption[];
  branches: RequestBranchOption[];
  lockedBranchId: string | null;
}) {
  const [state, formAction, pending] = useActionState<
    RequestActionState,
    FormData
  >(createRequest, initialRequestState);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const lockedBranch = branches.find(
    (branch: RequestBranchOption) => branch.id === lockedBranchId,
  );

  function handleAddProduct(product: RequestProductOption) {
    setLines((current: DraftLine[]) => {
      const existing = current.find(
        (line: DraftLine) => line.product_id === product.id,
      );
      if (existing) return current;
      nextLineKey += 1;
      return [
        ...current,
        {
          key: `line-${nextLineKey}`,
          product_id: product.id,
          product_name: product.name,
          quantity: "1",
        },
      ];
    });
  }

  function handleQuantityChange(key: string, value: string) {
    setLines((current: DraftLine[]) =>
      current.map((line: DraftLine) =>
        line.key === key ? { ...line, quantity: value } : line,
      ),
    );
  }

  function handleRemoveLine(key: string) {
    setLines((current: DraftLine[]) =>
      current.filter((line: DraftLine) => line.key !== key),
    );
  }

  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines.map((line: DraftLine) => ({
          product_id: line.product_id,
          quantity: Number.parseFloat(line.quantity) || 0,
        })),
      ),
    [lines],
  );

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lines" value={linesJson} />

      <div className="grid gap-1.5">
        <Label htmlFor="requesting_branch_id">Requesting branch</Label>
        {lockedBranchId ? (
          <>
            <input
              type="hidden"
              name="requesting_branch_id"
              value={lockedBranchId}
            />
            <p className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {lockedBranch?.name ?? "Your branch"}
            </p>
          </>
        ) : (
          <Select name="requesting_branch_id" disabled={pending}>
            <SelectTrigger id="requesting_branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: RequestBranchOption) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <ProductPicker products={products} onSelect={handleAddProduct} />

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No lines yet. Search a product above to add one.
                </TableCell>
              </TableRow>
            ) : (
              lines.map((line: DraftLine) => (
                <TableRow key={line.key}>
                  <TableCell className="font-medium">{line.product_name}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                        handleQuantityChange(line.key, event.target.value)
                      }
                      disabled={pending}
                      className="ml-auto h-8 w-24 text-right"
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleRemoveLine(line.key)}
                    >
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          disabled={pending}
          value={notes}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
            setNotes(event.target.value)
          }
          placeholder="Any additional context for this request"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || lines.length === 0}>
          {pending ? "Submitting..." : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
