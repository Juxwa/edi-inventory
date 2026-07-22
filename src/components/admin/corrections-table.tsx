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
import { formatDate } from "@/lib/format";
import type { CorrectionEntity } from "@/lib/validators/correction";

export type CorrectionRowData = {
  id: number;
  entity: CorrectionEntity | string;
  entity_id: string;
  action: string;
  before_data: unknown;
  after_data: unknown;
  reason: string;
  actor_name: string;
  created_at: string;
};

function formatEntityLabel(entity: string): string {
  return entity
    .split("_")
    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function CorrectionDetailRow({ row }: { row: CorrectionRowData }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TableRow>
        <TableCell>{formatDate(row.created_at)}</TableCell>
        <TableCell>{formatEntityLabel(row.entity)}</TableCell>
        <TableCell>
          <Badge variant={row.action === "void" ? "destructive" : "secondary"}>
            {row.action}
          </Badge>
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {row.entity_id.slice(0, 8)}
        </TableCell>
        <TableCell>{row.actor_name}</TableCell>
        <TableCell className="max-w-xs truncate" title={row.reason}>
          {row.reason}
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
                  Before
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                  {JSON.stringify(row.before_data, null, 2) ?? "null"}
                </pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  After
                </p>
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs">
                  {JSON.stringify(row.after_data, null, 2) ?? "null"}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

export function CorrectionsTable({ rows }: { rows: CorrectionRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium">No corrections match your filters.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Record</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row: CorrectionRowData) => (
            <CorrectionDetailRow key={row.id} row={row} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
