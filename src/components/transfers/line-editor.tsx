import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddLineButton, RemoveLineButton } from "@/components/transfers/line-actions";
import { SerialCorrectDialog } from "@/components/admin/serial-correct-dialog";

export type TransferLineRowData = {
  id: string;
  product_name: string;
  serial_snapshot: string | null;
  quantity: number;
  received_confirmed: boolean;
  received_note: string | null;
  is_repair_pool: boolean;
};

export type StockPoolFilter = "sellable" | "repair" | "all";

const POOL_OPTIONS: { value: StockPoolFilter; label: string }[] = [
  { value: "sellable", label: "Sellable" },
  { value: "repair", label: "Repair pool" },
  { value: "all", label: "All" },
];

type StockSearchRow = {
  id: string;
  serial_number: string | null;
  quantity: number;
  product_name: string;
  is_repair_pool: boolean;
};

const STOCK_SEARCH_LIMIT = 50;

async function searchAvailableStock(
  fromBranchId: string,
  query: string,
  pool: StockPoolFilter,
): Promise<StockSearchRow[]> {
  const supabase = await createClient();

  let productIds: string[] | null = null;
  if (query) {
    const { data: productMatches } = await supabase
      .from("products")
      .select("id")
      .ilike("name", `%${query}%`);
    productIds = (productMatches ?? []).map((row: { id: string }) => row.id);
  }

  let stockQuery = supabase
    .from("stock_visible")
    .select("id, serial_number, quantity, product_id, is_repair_pool, products(name)")
    .eq("branch_id", fromBranchId)
    .eq("status", "available")
    .gt("quantity", 0)
    .limit(STOCK_SEARCH_LIMIT);

  if (pool === "sellable") {
    stockQuery = stockQuery.eq("is_repair_pool", false);
  } else if (pool === "repair") {
    stockQuery = stockQuery.eq("is_repair_pool", true);
  }

  if (query) {
    const productIdList = productIds ?? [];
    if (productIdList.length > 0) {
      stockQuery = stockQuery.or(
        `serial_number.ilike.%${query}%,product_id.in.(${productIdList.join(",")})`,
      );
    } else {
      stockQuery = stockQuery.ilike("serial_number", `%${query}%`);
    }
  }

  const { data } = await stockQuery;
  type Row = {
    id: string;
    serial_number: string | null;
    quantity: number;
    is_repair_pool: boolean;
    products: { name: string } | { name: string }[] | null;
  };
  const rows: Row[] = (data as Row[] | null) ?? [];

  function firstOrNull<T>(value: T | T[] | null): T | null {
    if (value == null) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
  }

  return rows.map((row: Row) => ({
    id: row.id,
    serial_number: row.serial_number,
    quantity: row.quantity,
    is_repair_pool: row.is_repair_pool,
    product_name: firstOrNull(row.products)?.name ?? "—",
  }));
}

function RepairPoolBadge() {
  return <Badge variant="warning">Repair pool</Badge>;
}

export function TransferLinesTable({
  lines,
  canCorrectSerial = false,
  returnPath,
}: {
  lines: TransferLineRowData[];
  canCorrectSerial?: boolean;
  returnPath?: string;
}) {
  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border py-10 text-center">
        <p className="text-sm font-medium">No lines yet.</p>
      </div>
    );
  }

  const hasReceiveColumns = lines.some(
    (line: TransferLineRowData) => line.received_confirmed || line.received_note,
  );

  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            {hasReceiveColumns ? <TableHead>Received</TableHead> : null}
            {hasReceiveColumns ? <TableHead>Note</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line: TransferLineRowData) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  {line.product_name}
                  {line.is_repair_pool ? <RepairPoolBadge /> : null}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                <div className="flex items-center gap-1">
                  {line.serial_snapshot ?? "—"}
                  {canCorrectSerial ? (
                    <SerialCorrectDialog
                      scope="transfer_line"
                      id={line.id}
                      currentSerial={line.serial_snapshot}
                      returnPath={returnPath}
                    />
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {line.quantity}
              </TableCell>
              {hasReceiveColumns ? (
                <TableCell>{line.received_confirmed ? "Yes" : "No"}</TableCell>
              ) : null}
              {hasReceiveColumns ? (
                <TableCell className="text-muted-foreground">
                  {line.received_note ?? "—"}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DraftLinesEditor({
  transferId,
  lines,
}: {
  transferId: string;
  lines: TransferLineRowData[];
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                No lines yet. Search stock below to add lines.
              </TableCell>
            </TableRow>
          ) : (
            lines.map((line: TransferLineRowData) => (
              <TableRow key={line.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {line.product_name}
                    {line.is_repair_pool ? <RepairPoolBadge /> : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {line.serial_snapshot ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {line.quantity}
                </TableCell>
                <TableCell>
                  <RemoveLineButton transferId={transferId} lineId={line.id} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function buildStockHref(transferId: string, query: string, pool: StockPoolFilter): string {
  const params = new URLSearchParams();
  if (query) params.set("stockq", query);
  if (pool !== "sellable") params.set("pool", pool);
  const qs = params.toString();
  return `/transfers/${transferId}${qs ? `?${qs}` : ""}`;
}

export async function StockPicker({
  transferId,
  fromBranchId,
  query,
  pool,
}: {
  transferId: string;
  fromBranchId: string;
  query: string;
  pool: StockPoolFilter;
}) {
  const results = await searchAvailableStock(fromBranchId, query, pool);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {POOL_OPTIONS.map((option: { value: StockPoolFilter; label: string }) => (
          <Button
            key={option.value}
            asChild
            size="sm"
            variant={pool === option.value ? "default" : "outline"}
          >
            <Link href={buildStockHref(transferId, query, option.value)}>
              {option.label}
            </Link>
          </Button>
        ))}
      </div>

      <form method="get" className="flex items-end gap-2">
        {pool !== "sellable" ? (
          <input type="hidden" name="pool" value={pool} />
        ) : null}
        <div className="grid gap-1.5">
          <label htmlFor="stockq" className="text-sm font-medium">
            Search available stock
          </label>
          <Input
            id="stockq"
            name="stockq"
            defaultValue={query}
            placeholder="Serial or product name"
            className="w-64"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {query ? (
          <Button asChild variant="ghost">
            <Link href={buildStockHref(transferId, "", pool)}>Clear</Link>
          </Button>
        ) : null}
      </form>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Serial</TableHead>
              <TableHead className="text-right">Available qty</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No matching available stock.
                </TableCell>
              </TableRow>
            ) : (
              results.map((row: StockSearchRow) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {row.product_name}
                      {row.is_repair_pool ? <RepairPoolBadge /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.serial_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.quantity}
                  </TableCell>
                  <TableCell>
                    <AddLineButton
                      transferId={transferId}
                      stockId={row.id}
                      maxQuantity={row.quantity}
                      isSerialized={row.serial_number !== null}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
