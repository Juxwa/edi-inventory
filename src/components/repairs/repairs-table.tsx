import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RepairStatusBadge } from "@/components/repairs/status-badge";
import { formatDate } from "@/lib/format";
import type { RepairStatus } from "@/lib/validators/repair";

export type RepairRowData = {
  id: string;
  sar_no: string | null;
  customer_name: string;
  branch_name: string;
  serial: string;
  technician_name: string;
  status: RepairStatus;
  request_date: string;
};

export function RepairsTable({ rows }: { rows: RepairRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No repairs match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SAR no.</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Technician</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: RepairRowData) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/repairs/${row.id}`} className="font-medium hover:underline">
                  {row.sar_no ?? "—"}
                </Link>
              </TableCell>
              <TableCell>{row.customer_name}</TableCell>
              <TableCell>{row.branch_name}</TableCell>
              <TableCell>{row.serial}</TableCell>
              <TableCell>{row.technician_name}</TableCell>
              <TableCell>
                <RepairStatusBadge status={row.status} />
              </TableCell>
              <TableCell>{formatDate(row.request_date)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
