import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import type { ServiceAgg } from "@/app/(app)/analytics/query";

export function ServiceTable({ rows }: { rows: ServiceAgg[] }) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                No service sales in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: ServiceAgg) => (
              <TableRow key={row.service_id}>
                <TableCell className="font-medium">{row.service_name}</TableCell>
                <TableCell className="text-right tabular-nums">{row.units}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.revenue)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
