import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { toCsv, csvResponse, type CsvColumn } from "@/lib/csv";
import { parseMovementFilters, fetchMovements, type MovementRow } from "../query";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const url = new URL(request.url);
  const canFilterBranch = profile.role === "admin" || profile.role === "top_mgmt";
  const filters = parseMovementFilters({
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
    type: url.searchParams.get("type") ?? undefined,
    branch: canFilterBranch
      ? (url.searchParams.get("branch") ?? undefined)
      : undefined,
  });

  const supabase = await createClient();
  const [{ rows }, branchesResult] = await Promise.all([
    fetchMovements(supabase, filters),
    supabase.from("branches").select("id, name"),
  ]);

  const branchNameById = new Map<string, string>(
    (branchesResult.data ?? []).map((row: { id: string; name: string }) => [
      row.id,
      row.name,
    ]),
  );

  const productIds = Array.from(
    new Set(
      rows
        .map((row: MovementRow) => row.product_id)
        .filter((id: string | null): id is string => id !== null),
    ),
  );
  let productNameById = new Map<string, string>();
  if (productIds.length > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("id, name")
      .in("id", productIds);
    type ProductRow = { id: string; name: string };
    productNameById = new Map(
      ((productRows as ProductRow[] | null) ?? []).map((row: ProductRow) => [
        row.id,
        row.name,
      ]),
    );
  }

  const columns: CsvColumn<MovementRow>[] = [
    { header: "Date", value: (row) => row.occurred_at },
    { header: "Type", value: (row) => row.movement_type },
    {
      header: "Product",
      value: (row) =>
        row.product_id ? (productNameById.get(row.product_id) ?? "") : "",
    },
    { header: "Serial", value: (row) => row.serial_number ?? "" },
    { header: "Quantity", value: (row) => row.quantity },
    {
      header: "Branch",
      value: (row) => (row.branch_id ? (branchNameById.get(row.branch_id) ?? "") : ""),
    },
    {
      header: "Counterparty branch",
      value: (row) =>
        row.counterparty_branch_id
          ? (branchNameById.get(row.counterparty_branch_id) ?? "")
          : "",
    },
    { header: "Reference type", value: (row) => row.reference_type ?? "" },
    { header: "Reference ID", value: (row) => row.reference_id ?? "" },
    { header: "Note", value: (row) => row.note ?? "" },
  ];

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`movements-${today}.csv`, toCsv(rows, columns));
}
