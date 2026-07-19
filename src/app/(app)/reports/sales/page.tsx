import Link from "next/link";
import { redirect } from "next/navigation";
import { DownloadIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SalesChart, type SalesChartPoint } from "@/components/reports/sales-chart";
import { formatCurrency } from "@/lib/format";
import { parseSalesFilters, fetchMonthly, rollUpByMonth } from "./query";

export const dynamic = "force-dynamic";

type SalesReportPageProps = {
  searchParams: Promise<{ from?: string; to?: string; branch?: string }>;
};

function formatMonthLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export default async function SalesReportPage({
  searchParams,
}: SalesReportPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const params = await searchParams;
  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const filters = parseSalesFilters({
    from: params.from,
    to: params.to,
    branch: canFilterBranch ? params.branch : undefined,
  });

  const supabase = await createClient();

  const [branchesResult, monthlyRows] = await Promise.all([
    canFilterBranch
      ? supabase.from("branches").select("id, name").order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    fetchMonthly(supabase, filters),
  ]);
  const branches: { id: string; name: string }[] = branchesResult.data ?? [];

  const months = rollUpByMonth(monthlyRows);
  const chartData: SalesChartPoint[] = months.map((row) => ({
    month: row.month,
    net_sales: row.net_sales,
  }));

  const totals = months.reduce(
    (acc, row) => ({
      sale_count: acc.sale_count + row.sale_count,
      gross: acc.gross + row.gross,
      discount_total: acc.discount_total + row.discount_total,
      net_sales: acc.net_sales + row.net_sales,
      vat_total: acc.vat_total + row.vat_total,
      net_of_vat: acc.net_of_vat + row.net_of_vat,
      legacy_no_vat_count: acc.legacy_no_vat_count + row.legacy_no_vat_count,
    }),
    {
      sale_count: 0,
      gross: 0,
      discount_total: 0,
      net_sales: 0,
      vat_total: 0,
      net_of_vat: 0,
      legacy_no_vat_count: 0,
    },
  );

  const exportParams = new URLSearchParams();
  exportParams.set("from", filters.from);
  exportParams.set("to", filters.to);
  if (filters.branch) exportParams.set("branch", filters.branch);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Sales report</h1>
          <p className="text-sm text-muted-foreground">
            Net sales, discounts, and VAT by month. Live from the ledger.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/reports/sales/export?${exportParams.toString()}`}>
            <DownloadIcon className="size-4" />
            Export CSV
          </a>
        </Button>
      </div>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div className="grid gap-1.5">
          <label htmlFor="from" className="text-sm font-medium">
            From
          </label>
          <Input id="from" name="from" type="date" defaultValue={filters.from} className="w-40" />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="to" className="text-sm font-medium">
            To
          </label>
          <Input id="to" name="to" type="date" defaultValue={filters.to} className="w-40" />
        </div>
        {canFilterBranch ? (
          <div className="grid gap-1.5">
            <label htmlFor="branch" className="text-sm font-medium">
              Branch
            </label>
            <Select name="branch" defaultValue={filters.branch || undefined}>
              <SelectTrigger id="branch" className="w-44">
                <SelectValue placeholder="All branches" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch: { id: string; name: string }) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        <Button asChild variant="ghost">
          <Link href="/reports/sales">Reset</Link>
        </Button>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Monthly net sales</CardTitle>
        </CardHeader>
        <CardContent>
          <SalesChart data={chartData} />
        </CardContent>
      </Card>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Gross</TableHead>
              <TableHead className="text-right">Discounts</TableHead>
              <TableHead className="text-right">Net</TableHead>
              <TableHead className="text-right">VAT</TableHead>
              <TableHead className="text-right">Net of VAT</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {months.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No sales in the selected period.
                </TableCell>
              </TableRow>
            ) : (
              <>
                {months.map((row) => (
                  <TableRow key={row.month}>
                    <TableCell className="font-medium">
                      {formatMonthLabel(row.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.sale_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.gross)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.discount_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.net_sales)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.vat_total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.net_of_vat)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.sale_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totals.gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totals.discount_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totals.net_sales)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totals.vat_total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(totals.net_of_vat)}
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {totals.legacy_no_vat_count > 0 ? (
        <p className="text-xs text-muted-foreground">
          {totals.legacy_no_vat_count} sale
          {totals.legacy_no_vat_count === 1 ? " has" : "s have"} no VAT captured
          (recorded before VAT tracking); VAT totals exclude them.
        </p>
      ) : null}
    </div>
  );
}
