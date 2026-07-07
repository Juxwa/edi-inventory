import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomerInfoCard } from "@/components/customers/customer-info-card";
import { VisitForm } from "@/components/customers/visit-form";
import { VisitList, type VisitRowData } from "@/components/customers/visit-list";
import type { CustomerRecord } from "@/components/customers/customer-dialog";

export const dynamic = "force-dynamic";

const PURCHASES_LIMIT = 20;

type CustomerDetailPageProps = {
  params: Promise<{ id: string }>;
};

type SaleRow = {
  id: string;
  sale_date: string;
  or_no: string | null;
  discount: number | null;
};

type LineRow = {
  sale_id: string;
  quantity: number;
  unit_price: number;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function CustomerDetailPage({ params }: CustomerDetailPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, name, mobile_no, email, address, date_of_birth")
    .eq("id", id)
    .single();

  if (customerError || !customer) {
    notFound();
  }

  const customerRecord = customer as CustomerRecord;

  const [salesResult, visitsResult] = await Promise.all([
    supabase
      .from("sales")
      .select("id, sale_date, or_no, discount")
      .eq("customer_id", id)
      .order("sale_date", { ascending: false })
      .limit(PURCHASES_LIMIT),
    supabase
      .from("visits")
      .select("id, visit_date, purpose, purchased_during_visit, remarks, attachment_paths")
      .eq("customer_id", id)
      .order("visit_date", { ascending: false }),
  ]);

  const sales: SaleRow[] = (salesResult.data as SaleRow[] | null) ?? [];
  const visits: VisitRowData[] = (visitsResult.data as VisitRowData[] | null) ?? [];

  const saleIds = sales.map((sale: SaleRow) => sale.id);
  let lineTotalsBySaleId = new Map<string, number>();
  if (saleIds.length > 0) {
    const { data: lineRows } = await supabase
      .from("sale_line_items")
      .select("sale_id, quantity, unit_price")
      .in("sale_id", saleIds);
    const lines: LineRow[] = (lineRows as LineRow[] | null) ?? [];
    lineTotalsBySaleId = new Map();
    for (const line of lines) {
      const existing = lineTotalsBySaleId.get(line.sale_id) ?? 0;
      lineTotalsBySaleId.set(line.sale_id, existing + line.quantity * line.unit_price);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{customerRecord.name}</h1>
        <p className="text-sm text-muted-foreground">Customer record and visit history.</p>
      </div>

      <CustomerInfoCard customer={customerRecord} />

      <Card>
        <CardHeader>
          <CardTitle>Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          {sales.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No purchases recorded yet.
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>OR no.</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale: SaleRow) => {
                    const gross = lineTotalsBySaleId.get(sale.id) ?? 0;
                    const net = Math.max(0, gross - (sale.discount ?? 0));
                    return (
                      <TableRow key={sale.id}>
                        <TableCell>
                          <Link href={`/sales/${sale.id}`} className="font-medium hover:underline">
                            {formatDate(sale.sale_date)}
                          </Link>
                        </TableCell>
                        <TableCell>{sale.or_no ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(net)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <VisitForm customerId={customerRecord.id} />

      <Card>
        <CardHeader>
          <CardTitle>Visit history</CardTitle>
        </CardHeader>
        <CardContent>
          <VisitList visits={visits} />
        </CardContent>
      </Card>
    </div>
  );
}
