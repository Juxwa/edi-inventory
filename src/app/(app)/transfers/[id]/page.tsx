import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  type StockPoolFilter,
} from "@/components/transfers/line-editor";
import { ReceivePanel, type ReceiveLineRowData } from "@/components/transfers/receive-panel";
import { ChatThread } from "@/components/chat/chat-thread";
import { DispatchDialog } from "@/components/transfers/dispatch-dialog";
import { ReserveButton, DeleteDraftButton } from "@/components/transfers/lifecycle-buttons";
import { PrintButton } from "@/components/print-button";
import { VoidedBanner } from "@/components/admin/voided-banner";
import { VoidDialog } from "@/components/admin/void-dialog";
import { reverseTransfer } from "@/app/(app)/admin/corrections/actions";
import type { TransferStatus } from "@/lib/validators/transfer";

export const dynamic = "force-dynamic";

type TransferDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ stockq?: string; pool?: string }>;
};

function parsePoolFilter(value: string | undefined): StockPoolFilter {
  return value === "repair" || value === "all" ? value : "sellable";
}

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
  reversed_at: string | null;
  reversed_by: string | null;
  reverse_reason: string | null;
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
  if (!profile) {
    redirect("/");
  }

  const { id } = await params;
  const { stockq, pool } = await searchParams;
  const query = stockq?.trim() ?? "";
  const poolFilter = parsePoolFilter(pool);

  const supabase = await createClient();

  const { data: transfer, error: transferError } = await supabase
    .from("transfers")
    .select(
      "id, code, status, from_branch_id, to_branch_id, transfer_date, received_date, courier, tracking_code, sis_no, created_at, request_id, reversed_at, reversed_by, reverse_reason",
    )
    .eq("id", id)
    .single();

  if (transferError || !transfer) {
    notFound();
  }

  const transferRow = transfer as TransferDetailRow;

  const [branchesResult, reversedByResult] = await Promise.all([
    supabase.from("branches").select("id, name").order("name"),
    transferRow.reversed_by
      ? supabase.from("profiles").select("name").eq("id", transferRow.reversed_by).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const reversedByName = (reversedByResult.data as { name: string } | null)?.name ?? null;

  const branches: { id: string; name: string }[] = branchesResult.data ?? [];
  const branchNameById = new Map<string, string>(
    branches.map((branch: { id: string; name: string }) => [branch.id, branch.name]),
  );

  // Line product names are resolved via a direct stock -> products join
  // below rather than a nested Postgrest embed, since without generated
  // Database types a two-level embed's response shape is not reliable.
  const { data: lineRows } = await supabase
    .from("transfer_line_items")
    .select(
      "id, quantity, serial_snapshot, received_confirmed, received_quantity, received_note, stock_id, product_id",
    )
    .eq("transfer_id", transferRow.id);

  type RawLineRow = {
    id: string;
    quantity: number;
    serial_snapshot: string | null;
    received_confirmed: boolean;
    received_quantity: number | null;
    received_note: string | null;
    stock_id: string | null;
    product_id: string | null;
  };
  const rawLines: RawLineRow[] = (lineRows as RawLineRow[] | null) ?? [];

  const stockIds = rawLines
    .map((line: RawLineRow) => line.stock_id)
    .filter((stockId: string | null): stockId is string => stockId !== null);

  let productNameByStockId = new Map<string, string>();
  let poolByStockId = new Map<string, boolean>();
  if (stockIds.length > 0) {
    const { data: stockRows } = await supabase
      .from("stock_visible")
      .select("id, product_id, is_repair_pool, products(name)")
      .in("id", stockIds);
    type StockJoinRow = {
      id: string;
      is_repair_pool: boolean;
      products: { name: string } | { name: string }[] | null;
    };
    const rows: StockJoinRow[] = (stockRows as StockJoinRow[] | null) ?? [];
    productNameByStockId = new Map(
      rows.map((row: StockJoinRow) => [
        row.id,
        firstOrNull(row.products)?.name ?? "—",
      ]),
    );
    poolByStockId = new Map(
      rows.map((row: StockJoinRow) => [row.id, row.is_repair_pool]),
    );
  }

  // product_id fallback covers lines without a stock link (legacy imports)
  // AND lines whose stock the viewer cannot see — while in transit the stock
  // row still belongs to the origin branch, so stock_visible hides it from
  // the receiving branch.
  const fallbackProductIds = rawLines
    .filter(
      (line: RawLineRow) =>
        line.product_id &&
        !(line.stock_id && productNameByStockId.has(line.stock_id)),
    )
    .map((line: RawLineRow) => line.product_id as string);
  let productNameById = new Map<string, string>();
  if (fallbackProductIds.length > 0) {
    const { data: productRows } = await supabase
      .from("products")
      .select("id, name")
      .in("id", fallbackProductIds);
    type ProductRow = { id: string; name: string };
    productNameById = new Map(
      ((productRows as ProductRow[] | null) ?? []).map((row: ProductRow) => [row.id, row.name]),
    );
  }

  const lines: TransferLineRowData[] = rawLines.map((line: RawLineRow) => ({
    id: line.id,
    product_name:
      (line.stock_id ? productNameByStockId.get(line.stock_id) : undefined) ??
      (line.product_id ? productNameById.get(line.product_id) : undefined) ??
      "—",
    serial_snapshot: line.serial_snapshot,
    quantity: line.quantity,
    received_confirmed: line.received_confirmed,
    received_quantity: line.received_quantity,
    received_note: line.received_note,
    is_repair_pool: line.stock_id
      ? (poolByStockId.get(line.stock_id) ?? false)
      : false,
  }));

  const isAdmin = profile.role === "admin";
  const isFromBranchUser = profile.branch_id === transferRow.from_branch_id;
  const isToBranchUser = profile.branch_id === transferRow.to_branch_id;
  const canManageDraft = isAdmin || isFromBranchUser;
  const canReceive = isAdmin || isToBranchUser;

  const receiveLines: ReceiveLineRowData[] = lines;
  const hasDiscrepancy = lines.some(
    (line: TransferLineRowData) =>
      line.received_confirmed &&
      line.received_quantity !== null &&
      line.received_quantity < line.quantity,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Print-only letterhead for the transfer slip */}
      <div className="hidden print:block">
        <p className="text-lg font-bold">Ear Diagnostics Inc.</p>
        <p className="text-sm">Stock transfer slip</p>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{transferRow.code}</h1>
            <TransferStatusBadge status={transferRow.status} />
            {isStaleDraft(transferRow.status, transferRow.created_at) ? (
              <StaleDraftBadge />
            ) : null}
            {hasDiscrepancy ? <Badge variant="destructive">Discrepancy</Badge> : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {branchNameById.get(transferRow.from_branch_id) ?? "—"} {"→"}{" "}
            {branchNameById.get(transferRow.to_branch_id) ?? "—"}
          </p>
        </div>

        <div className="flex items-center gap-2 print:hidden">
          {transferRow.status === "draft" && canManageDraft ? (
            <>
              <ReserveButton transferId={transferRow.id} />
              <DeleteDraftButton transferId={transferRow.id} />
            </>
          ) : null}
          {transferRow.status === "reserved" && canManageDraft ? (
            <DispatchDialog transferId={transferRow.id} />
          ) : null}
          {isAdmin && transferRow.status === "confirmed" && !transferRow.reversed_at ? (
            <VoidDialog
              action={reverseTransfer}
              hiddenFields={{ transfer_id: transferRow.id }}
              triggerLabel="Reverse transfer"
              title="Reverse this transfer"
              description="Stock moves back to the origin branch with compensating movements. The transfer stays marked confirmed; the reversal is recorded."
              confirmLabel="Reverse transfer"
              pendingLabel="Reversing..."
            />
          ) : null}
          <PrintButton />
        </div>
      </div>

      {transferRow.reversed_at ? (
        <VoidedBanner
          label="REVERSED"
          reason={transferRow.reverse_reason}
          actorName={reversedByName}
          when={transferRow.reversed_at}
        />
      ) : null}

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
            <p className="text-muted-foreground">SIS number (internal)</p>
            <p className="font-medium">{transferRow.sis_no ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Courier</p>
            <p className="font-medium">{transferRow.courier ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Courier tracking / waybill no.</p>
            <p className="font-medium">{transferRow.tracking_code ?? "—"}</p>
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
                pool={poolFilter}
              />
            </>
          ) : transferRow.status === "in_transit" && canReceive ? (
            <ReceivePanel transferId={transferRow.id} lines={receiveLines} />
          ) : (
            <TransferLinesTable
              lines={lines}
              canCorrectSerial={isAdmin}
              returnPath={`/transfers/${transferRow.id}`}
            />
          )}
        </CardContent>
      </Card>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Messages</CardTitle>
          <CardDescription>
            Discuss this transfer with head office and the other branch.
            Everyone who can open this transfer sees this thread.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ChatThread
            channel={{ kind: "transfer", transferId: transferRow.id }}
            currentUserId={profile.id}
            emptyLabel="No messages on this transfer yet."
            className="h-80"
          />
        </CardContent>
      </Card>
    </div>
  );
}
