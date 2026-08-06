import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export type SalesLineData = {
  name: string;
  line_type: "stock" | "service";
  serial: string | null;
  warranty_expiry: string | null;
};

export type SalesRowData = {
  id: string;
  sale_date: string;
  or_no: string | null;
  customer_name: string;
  branch_name: string;
  lines: SalesLineData[];
  net: number;
  is_paid: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SalesTable({ rows }: { rows: SalesRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No sales match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>OR no.</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Service</TableHead>
            <TableHead>Serial no.</TableHead>
            <TableHead>Warranty expiry</TableHead>
            <TableHead className="text-right">Net</TableHead>
            <TableHead>Paid</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: SalesRowData) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/sales/${row.id}`} className="font-medium hover:underline">
                  {formatDate(row.sale_date)}
                </Link>
              </TableCell>
              <TableCell>{row.or_no ?? "—"}</TableCell>
              <TableCell>{row.customer_name}</TableCell>
              <TableCell>{row.branch_name}</TableCell>
              <TableCell>
                {row.lines.length === 0
                  ? "—"
                  : row.lines.map((line: SalesLineData, index: number) => (
                      <div key={index}>
                        {line.line_type === "stock" ? line.name : "—"}
                      </div>
                    ))}
              </TableCell>
              <TableCell>
                {row.lines.length === 0
                  ? "—"
                  : row.lines.map((line: SalesLineData, index: number) => (
                      <div key={index}>
                        {line.line_type === "service" ? line.name : "—"}
                      </div>
                    ))}
              </TableCell>
              <TableCell>
                {row.lines.length === 0
                  ? "—"
                  : row.lines.map((line: SalesLineData, index: number) => (
                      <div key={index}>{line.serial ?? "—"}</div>
                    ))}
              </TableCell>
              <TableCell>
                {row.lines.length === 0
                  ? "—"
                  : row.lines.map((line: SalesLineData, index: number) => (
                      <div key={index}>{formatDate(line.warranty_expiry)}</div>
                    ))}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(row.net)}
              </TableCell>
              <TableCell>
                {row.is_paid ? (
                  <Badge variant="success">Paid</Badge>
                ) : (
                  <Badge variant="warning">Unpaid</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
