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
import { formatDate } from "@/lib/format";
import type { EarmoldStatus } from "@/lib/validators/earmold";

export type EarmoldRowData = {
  id: string;
  patient_name: string;
  hearing_aid_model: string | null;
  side: string | null;
  branch_name: string;
  status: EarmoldStatus;
  created_at: string;
};

export function EarmoldStatusBadge({ status }: { status: EarmoldStatus }) {
  if (status === "pending") {
    return <Badge variant="secondary">Pending</Badge>;
  }
  if (status === "processing") {
    return (
      <Badge className="border-transparent bg-blue-600 text-white">
        Processing
      </Badge>
    );
  }
  return <Badge variant="success">Served</Badge>;
}

export function EarmoldsTable({ rows }: { rows: EarmoldRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center text-sm text-muted-foreground">
        No earmold requests match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Patient</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: EarmoldRowData) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link href={`/earmolds/${row.id}`} className="font-medium hover:underline">
                  {row.patient_name}
                </Link>
              </TableCell>
              <TableCell>{row.hearing_aid_model ?? "—"}</TableCell>
              <TableCell className="capitalize">{row.side ?? "—"}</TableCell>
              <TableCell>{row.branch_name}</TableCell>
              <TableCell>
                <EarmoldStatusBadge status={row.status} />
              </TableCell>
              <TableCell>{formatDate(row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
