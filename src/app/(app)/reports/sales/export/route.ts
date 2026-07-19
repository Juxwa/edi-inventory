import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import { parseSalesFilters, fetchPerSale, type PerSaleRow } from "../query";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const url = new URL(request.url);
  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const filters = parseSalesFilters({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    branch: canFilterBranch
      ? (url.searchParams.get("branch") ?? undefined)
      : undefined,
  });

  const supabase = await createClient();
  const [rows, branchesResult, salesMeta] = await Promise.all([
    fetchPerSale(supabase, filters),
    supabase.from("branches").select("id, name"),
    supabase
      .from("sales")
      .select("id, or_no, customer_id")
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to),
  ]);

  const branchNameById = new Map<string, string>(
    (branchesResult.data ?? []).map((row: { id: string; name: string }) => [
      row.id,
      row.name,
    ]),
  );
  type SaleMeta = { id: string; or_no: string | null; customer_id: string | null };
  const metaById = new Map<string, SaleMeta>(
    ((salesMeta.data as SaleMeta[] | null) ?? []).map((row: SaleMeta) => [
      row.id,
      row,
    ]),
  );

  const columns: CsvColumn<PerSaleRow>[] = [
    { header: "Sale date", value: (row) => row.sale_date },
    { header: "Branch", value: (row) => branchNameById.get(row.branch_id) ?? "" },
    { header: "OR no.", value: (row) => metaById.get(row.sale_id)?.or_no ?? "" },
    { header: "Gross", value: (row) => row.gross },
    { header: "Discount", value: (row) => row.discount },
    { header: "Net sales", value: (row) => row.net_sales },
    {
      header: "VAT",
      value: (row) => (row.vat_amount !== null ? row.vat_amount : "not captured"),
    },
    { header: "Net of VAT", value: (row) => row.net_of_vat },
    { header: "Paid", value: (row) => (row.is_paid ? "yes" : "no") },
    { header: "Sale ID", value: (row) => row.sale_id },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`sales-${today}.csv`, toCsv(rows, columns));
}
