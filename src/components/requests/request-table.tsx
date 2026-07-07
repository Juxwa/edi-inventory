import Link from "next/link";
import { FileTextIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/validators/request";

export type RequestRowData = {
  id: string;
  branch_name: string;
  requested_by_name: string;
  request_date: string;
  line_count: number;
  status: RequestStatus;
  has_notes: boolean;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatStatusLabel(status: RequestStatus): string {
  return status
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  if (status === "pending") {
    return <Badge variant="secondary">{formatStatusLabel(status)}</Badge>;
  }
  if (status === "processing") {
    return (
      <Badge className="border-transparent bg-amber-500 text-white">
        {formatStatusLabel(status)}
      </Badge>
    );
  }
  return <Badge variant="success">{formatStatusLabel(status)}</Badge>;
}

export function RequestTable({ rows }: { rows: RequestRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No requests match your search.</p>
        <p className="text-sm text-muted-foreground">
          Try a different filter.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead>Requested by</TableHead>
            <TableHead className="text-right">Lines</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: RequestRowData) => (
            <TableRow key={row.id} className="cursor-pointer">
              <TableCell className="font-medium">
                <Link href={`/requests/${row.id}`} className="hover:underline">
                  {formatDate(row.request_date)}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.branch_name}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {row.requested_by_name}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {row.line_count}
              </TableCell>
              <TableCell>
                <RequestStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                {row.has_notes ? (
                  <FileTextIcon className="size-4 text-muted-foreground" />
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
