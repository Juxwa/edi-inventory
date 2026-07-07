import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TransferStatusBadge,
  StaleDraftBadge,
  isStaleDraft,
} from "@/components/transfers/status-badge";
import {
  DraftLinesEditor,
  TransferLinesTable,
  StockPicker,
  type TransferLineRowData,
} from "@/components/transfers/line-editor";
import { ReceivePanel, type ReceiveLineRowData } from "@/components/transfers/receive-panel";
import { DispatchDialog } from "@/components/transfers/dispatch-dialog";
import { ReserveButton, DeleteDraftButton } from "@/components/transfers/lifecycle-buttons";
import type { TransferStatus } from "@/lib/validators/transfer";

export const dynamic = "force-dynamic";

type TransferDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stockq?: string }>;
};

type TransferDetailRow = {
  id: string;
  code: string;
  status: TransferStatus;
  from_branch_id: string;
  to_branch_id: string;
  transfer_date: string | null;
  received_date: string | null;
  courier: string | null;
  tracking_code: string | null;
  sis_no: string | null;
  created_at: string;
  request_id: string | null;
};

function firstOrNull<T>(value: T | T[] | null): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function TransferDetailPage({
  params,
  searchParams,
}: TransferDetailPageProps) {
  const profile = await getProfile();
  if (!profile || profile.role === "technical") {
    redirect("/");
  }

  const { id } = await params;
  const { stockq } = await searchParams;
  const query = stockq?.trim() ?? "";

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select(
      "id, code, status, from_branch_id, to_branch_id, transfer_date, received_date, courier, tracking_code, sis_no, created_at, request_id",
    )
    .eq("id", id)
    .single();

  if (transferError || !transfer) {
    notFound();
  }

  const transferRow = transfer as TransferDetailRow;

  const branchesResult = await supabase
    .from("branches")
    .select("id, name")
    .order("name");

  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  // Line product names are resolved via a direct stock -> products join
  // below rather than a nested Postgrest embed, since without generated
  // Database types a two-level embed's response shape is not reliable.
  const { data: lineRows } = await supabase
    .from("transfer_line_items")
    .select("id, quantity, serial_snapshot, received_confirmed, received_note, stock_id")
    .eq("transfer_id", transferRow.id);

  type RawLineRow = {
    id: string;
    quantity: number;
    serial_snapshot: string | null;
    received_confirmed: boolean;
    received_note: string | null;
    stock_id: string | null;
  };
  const rawLines: RawLineRow[] = (lineRows as RawLineRow[] | null) ?? [];

  const stockIds = rawLines
    .map((line: RawLineRow) => line.stock_id)
    .filter((stockId: string | null): stockId is string => stockId !== null);

  let productNameByStockId = new Map<string, string>();
  if (stockIds.length > 0) {
    const { data: stockRows } = await supabase
      .from("stock")
      .select("id, product_id, products(name)")
      .in("id", stockIds);
    type StockJoinRow = {
      id: string;
      products: { name: string } | { name: string }[] | null;
    };
    const rows: StockJoinRow[] = (stockRows as StockJoinRow[] | null) ?? [];
    productNameByStockId = new Map(
      rows.map((row: StockJoinRow) => [
        row.id,
        firstOrNull(row.products)?.name ?? "—",
      ]),
    );
  }

  const lines: TransferLineRowData[] = rawLines.map((line: RawLineRow) => ({
    id: line.id,
    product_name: line.stock_id
      ? (productNameByStockId.get(line.stock_id) ?? "—")
      : "—",
    serial_snapshot: line.serial_snapshot,
    quantity: line.quantity,
    received_confirmed: line.received_confirmed,
    received_note: line.received_note,
  }));

  const isAdmin = profile.role === "admin";
  const isFromBranchUser = profile.branch_id === transferRow.from_branch_id;
  const isToBranchUser = profile.branch_id === transferRow.to_branch_id;
  const canManageDraft = isAdmin || isFromBranchUser;
  const canReceive = isAdmin || isToBranchUser;

  const receiveLines: ReceiveLineRowData[] = lines;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{transferRow.code}</h1>
            <TransferStatusBadge status={transferRow.status} />
            {isStaleDraft(transferRow.status, transferRow.created_at) ? (
              <StaleDraftBadge />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {branchNameById.get(transferRow.from_branch_id) ?? "—"} {"→"}{" "}
            {branchNameById.get(transferRow.to_branch_id) ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {transferRow.status === "draft" && canManageDraft ? (
            <>
              <ReserveButton transferId={transferRow.id} />
              <DeleteDraftButton transferId={transferRow.id} />
            </>
          ) : null}
          {transferRow.status === "reserved" && canManageDraft ? (
            <DispatchDialog transferId={transferRow.id} />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">Transfer date</p>
            <p className="font-medium">{formatDate(transferRow.transfer_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Received date</p>
            <p className="font-medium">{formatDate(transferRow.received_date)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Courier</p>
            <p className="font-medium">{transferRow.courier ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tracking / SIS</p>
            <p className="font-medium">
              {transferRow.tracking_code ?? "—"}
              {transferRow.sis_no ? ` / ${transferRow.sis_no}` : ""}
            </p>
          </div>
          {transferRow.request_id ? (
            <div>
              <p className="text-muted-foreground">Linked request</p>
              <p className="font-medium">{transferRow.request_id}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {transferRow.status === "draft" && canManageDraft ? (
            <>
              <DraftLinesEditor transferId={transferRow.id} lines={lines} />
              <StockPicker
                transferId={transferRow.id}
                fromBranchId={transferRow.from_branch_id}
                query={query}
              />
            </>
          ) : transferRow.status === "in_transit" && canReceive ? (
            <ReceivePanel transferId={transferRow.id} lines={receiveLines} />
          ) : (
            <TransferLinesTable lines={lines} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
