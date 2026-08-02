"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export type ActivityRowData = {
  id: number;
  occurred_at: string;
  table_name: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  actor_name: string;
  old_data: unknown;
  new_data: unknown;
  changed_cols: string[] | null;
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function opVariant(op: ActivityRowData["op"]): "default" | "secondary" | "destructive" {
  if (op === "DELETE") return "destructive";
  if (op === "INSERT") return "default";
  return "secondary";
}

function changedColsSummary(cols: string[] | null): string {
  if (!cols || cols.length === 0) return "—";
  if (cols.length <= 3) return cols.join(", ");
  return `${cols.slice(0, 3).join(", ")} +${cols.length - 3} more`;
}

function ActivityDetailRow({ row }: { row: ActivityRowData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap">{formatTimestamp(row.occurred_at)}</TableCell>
        <TableCell>{row.table_name}</TableCell>
        <TableCell>
          <Badge variant={opVariant(row.op)}>{row.op}</Badge>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.row_id ? row.row_id.slice(0, 8) : "—"}
        </TableCell>
        <TableCell>{row.actor_name}</TableCell>
        <TableCell className="max-w-xs truncate" title={changedColsSummary(row.changed_cols)}>
          {changedColsSummary(row.changed_cols)}
        </TableCell>
        <TableCell>
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {open ? (
              <ChevronDownIcon className="size-4" />
            ) : (
              <ChevronRightIcon className="size-4" />
            )}
            Details
          </button>
        </TableCell>
      </TableRow>
      {open ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-muted/30">
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  Old data
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                  {JSON.stringify(row.old_data, null, 2) ?? "null"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  New data
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                  {JSON.stringify(row.new_data, null, 2) ?? "null"}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function ActivityTable({ rows }: { rows: ActivityRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No activity matches your filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Table</TableHead>
            <TableHead>Op</TableHead>
            <TableHead>Row</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Changed</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: ActivityRowData) => (
            <ActivityDetailRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
