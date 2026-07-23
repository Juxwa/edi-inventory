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
import {
  TransferStatusBadge,
  StaleDraftBadge,
  isStaleDraft,
} from "@/components/transfers/status-badge";
import type { TransferStatus } from "@/lib/validators/transfer";

export type TransferRowData = {
  id: string;
  code: string;
  from_branch_name: string;
  to_branch_name: string;
  status: TransferStatus;
  line_count: number;
  transfer_date: string | null;
  received_date: string | null;
  courier: string | null;
  created_at: string;
  has_discrepancy: boolean;
};

function DiscrepancyBadge() {
  return <Badge variant="destructive">Discrepancy</Badge>;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function TransferTable({ rows }: { rows: TransferRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No transfers match your search.</p>
        <p className="text-sm text-muted-foreground">
          Try a different search term or filter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Code</TableHead>
            <TableHead>From</TableHead>
            <TableHead>To</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead>Transfer date</TableHead>
            <TableHead>Received</TableHead>
            <TableHead>Courier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: TransferRowData) => (
            <TableRow key={row.id} className="cursor-pointer">
              <TableCell className="font-medium">
                <Link href={`/transfers/${row.id}`} className="hover:underline">
                  {row.code}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.from_branch_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.to_branch_name}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <TransferStatusBadge status={row.status} />
                  {isStaleDraft(row.status, row.created_at) ? (
                    <StaleDraftBadge />
                  ) : null}
                  {row.has_discrepancy ? <DiscrepancyBadge /> : null}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.line_count}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(row.transfer_date)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(row.received_date)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.courier ?? "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
