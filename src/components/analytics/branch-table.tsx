import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BranchAgg } from "@/app/(app)/analytics/query";

function RankMovement({
  currentRank,
  previousRank,
}: {
  currentRank: number;
  previousRank: number | undefined;
}) {
  if (previousRank === undefined) {
    return <span className="text-xs text-muted-foreground">New</span>;
  }
  const delta = previousRank - currentRank;
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MinusIcon className="size-3" />
        No change
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        up ? "text-success" : "text-destructive",
      )}
    >
      {up ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(delta)}
    </span>
  );
}

export function BranchTable({
  rows,
  previousRankByBranch,
}: {
  rows: BranchAgg[];
  previousRankByBranch: Map<string, number>;
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Branch</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead className="text-right">Units</TableHead>
            <TableHead className="text-right">Margin</TableHead>
            <TableHead className="text-right">Share</TableHead>
            <TableHead className="text-right">vs previous</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                No branch sales in the selected period.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row: BranchAgg) => (
              <TableRow key={row.branch_id}>
                <TableCell className="text-muted-foreground">{row.rank}</TableCell>
                <TableCell className="font-medium">{row.branch_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.revenue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.units}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(row.margin)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {row.share_pct.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right">
                  <RankMovement
                    currentRank={row.rank}
                    previousRank={previousRankByBranch.get(row.branch_id)}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
