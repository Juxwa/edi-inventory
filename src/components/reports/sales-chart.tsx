"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SalesChartPoint = {
  month: string; // "2026-07-01"
  net_sales: number;
};

const BAR_COLOR = "#b3283e"; // validated: dataviz six-checks, light surface

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

export function SalesChart({
  data,
  compact = false,
}: {
  data: SalesChartPoint[];
  compact?: boolean;
}) {
  if (data.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        No sales in the selected period.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={compact ? 120 : 280}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 0, left: compact ? 0 : 8 }}
      >
        {!compact ? (
          <CartesianGrid vertical={false} stroke="var(--border)" />
        ) : null}
        <XAxis
          dataKey="month"
          tickFormatter={formatMonth}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          hide={compact}
        />
        <YAxis
          tickFormatter={compactCurrency}
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
          hide={compact}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          formatter={(value: unknown) => [
            currencyFormatter.format(Number(value)),
            "Net sales",
          ]}
          labelFormatter={(label: unknown) => formatMonth(String(label))}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--background)",
            fontSize: 12,
          }}
        />
        <Bar
          dataKey="net_sales"
          fill={BAR_COLOR}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
