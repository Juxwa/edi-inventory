import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { SkuAgg } from "@/app/(app)/analytics/query";

export function SkuTable({
  rows,
  sort,
  buildHref,
}: {
  rows: SkuAgg[];
  sort: "units" | "revenue";
  buildHref: (sort: "units" | "revenue") => string;
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">
              <Link
                href={buildHref("units")}
                className={sort === "units" ? "font-semibold text-foreground" : ""}
              >
                Units
              </Link>
            </TableHead>
            <TableHead className="text-right">
              <Link
                href={buildHref("revenue")}
                className={sort === "revenue" ? "font-semibold text-foreground" : ""}
              >
                Revenue
              </Link>
            </TableHead>
            <TableHead className="text-right">Margin %</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                No product sales in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: SkuAgg) => (
              <TableRow key={row.product_id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/inventory?q=${encodeURIComponent(row.product_name)}`}
                    className="hover:underline"
                  >
                    {row.product_name}
                  </Link>
                </TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell className="text-right tabular-nums">{row.units}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.margin_pct === null ? "—" : `${row.margin_pct.toFixed(1)}%`}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
