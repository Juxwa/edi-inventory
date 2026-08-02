import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";
import type { CustomerAgg } from "@/app/(app)/analytics/query";

export function VipCustomerTable({
  rows,
  allTimeByCustomer,
}: {
  rows: CustomerAgg[];
  allTimeByCustomer: Map<string, number>;
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Value (period)</TableHead>
            <TableHead className="text-right">Value (all-time)</TableHead>
            <TableHead className="text-right">Sales</TableHead>
            <TableHead>Last purchase</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No customer sales in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: CustomerAgg, index: number) => (
              <TableRow key={row.customer_id}>
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/customers/${row.customer_id}`}
                    className="hover:underline"
                  >
                    {row.customer_name}
                  </Link>
                </TableCell>
                <TableCell>{row.branch_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.total_value)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(allTimeByCustomer.get(row.customer_id) ?? row.total_value)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.sale_count}</TableCell>
                <TableCell>{formatDate(row.last_purchase_date)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
