import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type Kpi = {
  label: string;
  value: string;
  // Percent change vs the previous equivalent period. null = no comparable
  // previous-period data (e.g. previous period had zero and current is also
  // zero, or previous couldn't be computed).
  deltaPct: number | null;
};

function DeltaBadge({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <MinusIcon className="size-3" />
        n/a
      </span>
    );
  }
  const rounded = Math.round(deltaPct * 10) / 10;
  const isFlat = rounded === 0;
  const isUp = rounded > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium",
        isFlat
          ? "text-muted-foreground"
          : isUp
            ? "text-success"
            : "text-destructive",
      )}
    >
      {isFlat ? (
        <MinusIcon className="size-3" />
      ) : isUp ? (
        <ArrowUpIcon className="size-3" />
      ) : (
        <ArrowDownIcon className="size-3" />
      )}
      {Math.abs(rounded)}% vs previous period
    </span>
  );
}

export function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {kpis.map((kpi: Kpi) => (
        <Card key={kpi.label}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              {kpi.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <span className="text-xl font-semibold tabular-nums">{kpi.value}</span>
            <DeltaBadge deltaPct={kpi.deltaPct} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
