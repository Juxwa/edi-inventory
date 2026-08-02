import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RepairsByProductAgg } from "@/app/(app)/analytics/query";

export function RepairsByProductTable({ rows }: { rows: RepairsByProductAgg[] }) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Repairs</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No repairs could be matched to a product in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: RepairsByProductAgg) => (
              <TableRow key={row.product_id}>
                <TableCell className="font-medium">{row.product_name}</TableCell>
                <TableCell>{row.category}</TableCell>
                <TableCell className="text-right tabular-nums">{row.repair_count}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
