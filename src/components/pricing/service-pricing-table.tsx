"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { setServicePrice, clearServicePrice } from "@/app/(app)/pricing/actions";

export type ServicePricingRow = {
  id: string;
  name: string;
  price: number | null;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function PriceRow({
  row,
  branchId,
}: {
  row: ServicePricingRow;
  branchId: string;
}) {
  const [value, setValue] = useState<string>(row.price !== null ? String(row.price) : "");
  const [savedPrice, setSavedPrice] = useState<number | null>(row.price);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    const parsed = Number.parseFloat(value);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error("Enter a valid non-negative price.");
      return;
    }
    startTransition(async () => {
      const result = await setServicePrice(row.id, branchId, parsed);
      if (!result.ok) {
        toast.error(result.error ?? "Could not save price.");
        return;
      }
      setSavedPrice(parsed);
      toast.success(`${row.name} price updated.`);
    });
  }

  function handleClear() {
    startTransition(async () => {
      const result = await clearServicePrice(row.id, branchId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not clear price.");
        return;
      }
      setSavedPrice(null);
      setValue("");
      toast.success(`${row.name} price cleared.`);
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="text-muted-foreground">
        {savedPrice !== null ? formatCurrency(savedPrice) : "Not set"}
      </TableCell>
      <TableCell className="text-right">
        <Input
          type="number"
          min="0"
          step="0.01"
          value={value}
          disabled={pending}
          onChange={(event: React.ChangeEvent<HTMLInputElement>) => setValue(event.target.value)}
          className="ml-auto h-8 w-28 text-right"
        />
      </TableCell>
      <TableCell className="w-44 text-right">
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" disabled={pending} onClick={handleSave}>
            {pending ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending || savedPrice === null}
            onClick={handleClear}
          >
            Clear
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function ServicePricingTable({
  rows,
  branchId,
  readOnly = false,
}: {
  rows: ServicePricingRow[];
  branchId: string;
  readOnly?: boolean;
}) {
  const columnCount = readOnly ? 2 : 4;
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Current price</TableHead>
            {readOnly ? null : (
              <>
                <TableHead className="text-right">New price</TableHead>
                <TableHead className="w-44" />
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="text-center text-muted-foreground">
                No services found.
              </TableCell>
            </TableRow>
          ) : readOnly ? (
            rows.map((row: ServicePricingRow) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {row.price !== null ? formatCurrency(row.price) : "Not set"}
                </TableCell>
              </TableRow>
            ))
          ) : (
            rows.map((row: ServicePricingRow) => (
              <PriceRow key={row.id} row={row} branchId={branchId} />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
