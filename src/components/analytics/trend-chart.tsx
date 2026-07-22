"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendSeries, TrendSeriesPoint } from "@/app/(app)/analytics/query";

// Fixed palette, cycled if there are more series than colors (capped at 7:
// top 6 branches + "Others" per buildTrendSeries).
const LINE_COLORS = [
  "#b3283e",
  "#2563eb",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#6b7280",
];

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
});

function formatMonth(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { month: "short", year: "2-digit" });
}

function compactCurrency(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `₱${(value / 1_000).toFixed(0)}k`;
  return `₱${value}`;
}

export function TrendChart({ series }: { series: TrendSeries }) {
  if (series.points.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No sales in the selected period.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={series.points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis
          tickFormatter={compactCurrency}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <Tooltip
          formatter={(value: unknown) => currencyFormatter.format(Number(value))}
          labelFormatter={(label: unknown) => formatMonth(String(label))}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--background)",
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {series.branches.map((branch: { key: string; name: string }, index: number) => (
          <Line
            key={branch.key}
            type="monotone"
            dataKey={branch.key}
            name={branch.name}
            stroke={LINE_COLORS[index % LINE_COLORS.length]}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export type { TrendSeriesPoint };
