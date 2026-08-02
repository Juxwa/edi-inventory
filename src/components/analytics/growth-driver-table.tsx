import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GrowthDriverRow } from "@/app/(app)/analytics/query";

function DeltaCell({ delta, deltaPct }: { delta: number; deltaPct: number | null }) {
  const isFlat = delta === 0;
  const isUp = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 tabular-nums",
        isFlat ? "text-muted-foreground" : isUp ? "text-success" : "text-destructive",
      )}
    >
      {isFlat ? (
        <MinusIcon className="size-3" />
      ) : isUp ? (
        <ArrowUpIcon className="size-3" />
      ) : (
        <ArrowDownIcon className="size-3" />
      )}
      {formatCurrency(Math.abs(delta))}
      {deltaPct !== null && ` (${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
    </span>
  );
}

export function GrowthDriverTable({ rows }: { rows: GrowthDriverRow[] }) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Current period</TableHead>
            <TableHead className="text-right">Previous period</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                No product sales in either period to compare.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: GrowthDriverRow, index: number) => (
              <TableRow key={row.product_id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{row.product_name}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.current_revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.previous_revenue)}
                </TableCell>
                <TableCell className="text-right">
                  <DeltaCell delta={row.delta} deltaPct={row.delta_pct} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
