"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { createClient } from "@/lib/supabase/client";
import { recordSale } from "@/app/(app)/sales/actions";
import {
  initialSaleState,
  DISCOUNT_TYPES,
  type SaleActionState,
  type DiscountType,
} from "@/lib/validators/sale";

export type SaleCustomerOption = {
  id: string;
  name: string;
  mobile_no: string | null;
};

export type SaleStockOption = {
  id: string;
  serial_number: string | null;
  quantity: number;
  product_id: string;
  product_name: string;
  srp: number | null;
};

export type SaleServiceOption = {
  id: string;
  name: string;
  price: number;
};

type DraftLine = {
  key: string;
  line_type: "stock" | "service";
  ref_id: string;
  label: string;
  serial_number: string | null;
  max_quantity: number | null;
  quantity: string;
  unit_price: string;
  is_freebie: boolean;
};

let nextLineKey = 0;

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function todayIsoDate(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const DISCOUNT_TYPE_LABELS: Record<DiscountType, string> = {
  none: "No discount",
  final_price: "Final sale price",
  custom_amount: "Discount amount",
  custom_percent: "Discount %",
  senior_citizen: "Senior Citizen 20%",
  pwd: "PWD 20%",
};

function CustomerPicker({
  customers,
  selected,
  onSelect,
  useNewCustomer,
  onToggleNewCustomer,
  disabled,
}: {
  customers: SaleCustomerOption[];
  selected: SaleCustomerOption | null;
  onSelect: (customer: SaleCustomerOption | null) => void;
  useNewCustomer: boolean;
  onToggleNewCustomer: (value: boolean) => void;
  disabled: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  // null = no active search; the server-side results otherwise. The customers
  // prop is only a starter list (recent customers) — the full directory is
  // searched server-side, since it is far too large to ship to the client.
  const [results, setResults] = useState<SaleCustomerOption[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    let cancelled = false;
    const timer = setTimeout(async () => {
      // PostgREST or() treats , ( ) as syntax; strip them from the term.
      const term = trimmed.replace(/[,()]/g, " ").trim();
      const { data } = await supabase
        .from("customers")
        .select("id, name, mobile_no")
        .or(`name.ilike.%${term}%,mobile_no.ilike.%${term}%`)
        .order("name")
        .limit(50);
      if (!cancelled) {
        setResults((data as SaleCustomerOption[] | null) ?? []);
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, supabase]);

  const filtered = results ?? customers.slice(0, 50);
  const selectedId = selected?.id ?? null;

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <Label>Customer</Label>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onToggleNewCustomer(!useNewCustomer)}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          {useNewCustomer ? "Pick existing customer" : "New customer"}
        </button>
      </div>

      {useNewCustomer ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new_customer_name">Name</Label>
            <Input
              id="new_customer_name"
              name="new_customer_name"
              required
              disabled={disabled}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new_customer_mobile">Mobile (optional)</Label>
            <Input
              id="new_customer_mobile"
              name="new_customer_mobile"
              disabled={disabled}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new_customer_email">Email (optional)</Label>
            <Input
              id="new_customer_email"
              name="new_customer_email"
              type="email"
              disabled={disabled}
            />
          </div>
        </div>
      ) : (
        <div className="grid gap-1.5">
          <Input
            id="customer-search"
            placeholder="Search all customers by name or mobile"
            value={query}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setQuery(event.target.value)
            }
            disabled={disabled}
          />
          {selected ? (
            <p className="text-sm text-muted-foreground">
              Selected:{" "}
              <span className="font-medium text-foreground">{selected.name}</span>
              {selected.mobile_no ? ` (${selected.mobile_no})` : ""}
            </p>
          ) : null}
          <div className="max-h-48 overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {searching ? "Searching…" : "No customers match."}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {filtered.map((customer: SaleCustomerOption) => (
                  <li key={customer.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(customer)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                        customer.id === selectedId
                          ? "bg-accent text-accent-foreground"
                          : ""
                      }`}
                    >
                      <span className="font-medium">{customer.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {customer.mobile_no ?? "No mobile"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StockPicker({
  stockOptions,
  onAdd,
  disabled,
}: {
  stockOptions: SaleStockOption[];
  onAdd: (stock: SaleStockOption) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length === 0) return stockOptions;
    return stockOptions.filter((stock: SaleStockOption) => {
      const name = stock.product_name.toLowerCase();
      const serial = stock.serial_number?.toLowerCase() ?? "";
      return name.includes(trimmed) || serial.includes(trimmed);
    });
  }, [stockOptions, query]);

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="stock-search">Add product from stock</Label>
      <Input
        id="stock-search"
        placeholder="Type to filter by product name or serial"
        value={query}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setQuery(event.target.value)
        }
        disabled={disabled}
      />
      <div className="max-h-48 overflow-y-auto rounded-md border border-border">
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            No available stock matches.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {filtered.slice(0, 100).map((stock: SaleStockOption) => (
              <li key={stock.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onAdd(stock);
                    setQuery("");
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
                >
                  <span className="font-medium">{stock.product_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {stock.serial_number
                      ? `Serial: ${stock.serial_number}`
                      : `Available qty: ${stock.quantity}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function SaleForm({
  branches,
  lockedBranchId,
  customers,
  stockOptions,
  serviceOptions,
  role,
  isPartnerBranch = false,
}: {
  branches: { id: string; name: string }[];
  lockedBranchId: string | null;
  customers: SaleCustomerOption[];
  stockOptions: SaleStockOption[];
  serviceOptions: SaleServiceOption[];
  role: "admin" | "branch_rep" | "top_mgmt" | "technical";
  isPartnerBranch?: boolean;
}) {
  const [state, formAction, pending] = useActionState<
    SaleActionState,
    FormData
  >(recordSale, initialSaleState);

  // Branch reps at company branches sell at SRP only — line prices pre-fill
  // from products.srp / service_pricing (see handleAddStock/handleAddService
  // below) and are read-only here. Branch reps at PARTNER branches
  // (isPartnerBranch) run their own SRP, so they get an editable price that
  // still prefills the same default. Admin may always edit line prices. The
  // server re-derives prices from SRP for branch_rep at non-partner branches
  // regardless of what's submitted (see recordSale in actions.ts) — this is
  // UI convenience, not the trust boundary.
  const linePricesLocked = role === "branch_rep" && !isPartnerBranch;

  const [selectedCustomer, setSelectedCustomer] =
    useState<SaleCustomerOption | null>(null);
  const [useNewCustomer, setUseNewCustomer] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [discountType, setDiscountType] = useState<DiscountType>("none");
  const [discountIdNo, setDiscountIdNo] = useState("");
  const [discountPercent, setDiscountPercent] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [finalPrice, setFinalPrice] = useState("");
  const [vatExempt, setVatExempt] = useState(false);
  const [serviceSelectValue, setServiceSelectValue] = useState<string>("");

  useEffect(() => {
    if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  const isScOrPwd = discountType === "senior_citizen" || discountType === "pwd";

  // VAT-exempt is auto-checked AND locked whenever SC/PWD is selected — those
  // discounts are always VAT-exempt by law (RA 9994 / RA 10754).
  useEffect(() => {
    if (isScOrPwd) setVatExempt(true);
  }, [isScOrPwd]);

  const lockedBranch = branches.find(
    (branch: { id: string; name: string }) => branch.id === lockedBranchId,
  );

  function handleAddStock(stock: SaleStockOption) {
    setLines((current: DraftLine[]) => {
      const existing = current.find(
        (line: DraftLine) => line.line_type === "stock" && line.ref_id === stock.id,
      );
      if (existing) return current;
      nextLineKey += 1;
      const isSerialized = stock.serial_number !== null;
      return [
        ...current,
        {
          key: `line-${nextLineKey}`,
          line_type: "stock",
          ref_id: stock.id,
          label: stock.product_name,
          serial_number: stock.serial_number,
          max_quantity: isSerialized ? 1 : stock.quantity,
          quantity: "1",
          unit_price: stock.srp !== null ? String(stock.srp) : "0",
          is_freebie: false,
        },
      ];
    });
  }

  function handleAddService(service: SaleServiceOption) {
    setLines((current: DraftLine[]) => {
      nextLineKey += 1;
      return [
        ...current,
        {
          key: `line-${nextLineKey}`,
          line_type: "service",
          ref_id: service.id,
          label: service.name,
          serial_number: null,
          max_quantity: null,
          quantity: "1",
          unit_price: String(service.price),
          is_freebie: false,
        },
      ];
    });
    setServiceSelectValue("");
  }

  function handleLineChange(
    key: string,
    field: "quantity" | "unit_price",
    value: string,
  ) {
    setLines((current: DraftLine[]) =>
      current.map((line: DraftLine) =>
        line.key === key ? { ...line, [field]: value } : line,
      ),
    );
  }

  // Checking "Freebie" zeroes + locks that line's price display — the RPC
  // also forces unit_price = 0 server-side regardless of what's submitted
  // (see recordSale in actions.ts), so this is UI convenience, not the
  // trust boundary. Stock lines still run the full availability/decrement
  // path; only the price is affected.
  function handleToggleFreebie(key: string, checked: boolean) {
    setLines((current: DraftLine[]) =>
      current.map((line: DraftLine) =>
        line.key === key
          ? { ...line, is_freebie: checked, unit_price: checked ? "0" : line.unit_price }
          : line,
      ),
    );
  }

  function handleRemoveLine(key: string) {
    setLines((current: DraftLine[]) =>
      current.filter((line: DraftLine) => line.key !== key),
    );
  }

  const gross = useMemo(
    () =>
      lines.reduce((sum: number, line: DraftLine) => {
        const qty = Number.parseFloat(line.quantity) || 0;
        const price = Number.parseFloat(line.unit_price) || 0;
        return sum + qty * price;
      }, 0),
    [lines],
  );

  // Mirrors the server-side formulas in sales/actions.ts (computeDiscountAndVat) —
  // this is display-only; the server recomputes from the submitted lines and
  // never trusts these client totals. Prices are VAT-inclusive (12%). VAT is
  // never hand-typed: it's always derived from the final price, or 0 when the
  // sale is VAT-exempt.
  const discountPercentValue = Number.parseFloat(discountPercent) || 0;
  const discountAmountValue = Number.parseFloat(discountAmount) || 0;
  const finalPriceValue = Number.parseFloat(finalPrice) || 0;

  // SC/PWD is always VAT-exempt regardless of the checkbox state (which is
  // locked+on for these modes anyway).
  const effectiveVatExempt = vatExempt || isScOrPwd;

  let discountValue = 0;
  let finalValue = 0;
  if (isScOrPwd) {
    const vatExemptBase = round2(gross / 1.12);
    discountValue = round2(vatExemptBase * 0.2);
    finalValue = Math.max(0, round2(vatExemptBase - discountValue));
  } else if (discountType === "final_price") {
    finalValue = Math.min(finalPriceValue, gross);
    discountValue = round2(Math.max(0, gross - finalValue));
  } else if (discountType === "custom_percent") {
    discountValue = round2(gross * (discountPercentValue / 100));
    finalValue = Math.max(0, round2(gross - discountValue));
  } else if (discountType === "custom_amount") {
    discountValue = round2(Math.min(discountAmountValue, gross));
    finalValue = Math.max(0, round2(gross - discountValue));
  } else {
    discountValue = 0;
    finalValue = gross;
  }

  const vatValue = effectiveVatExempt ? 0 : round2((finalValue * 12) / 112);
  const discountExceedsGross = discountType === "custom_amount" && discountAmountValue > gross;
  const finalExceedsGross = discountType === "final_price" && finalPriceValue > gross;

  const linesJson = useMemo(
    () =>
      JSON.stringify(
        lines.map((line: DraftLine) => ({
          line_type: line.line_type,
          stock_id: line.line_type === "stock" ? line.ref_id : null,
          service_id: line.line_type === "service" ? line.ref_id : null,
          quantity: Number.parseFloat(line.quantity) || 0,
          unit_price: Number.parseFloat(line.unit_price) || 0,
          is_freebie: line.is_freebie,
        })),
      ),
    [lines],
  );

  const customerId = useNewCustomer ? "" : (selectedCustomer?.id ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="lines" value={linesJson} />
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="branch_id">Branch</Label>
        {lockedBranchId ? (
          <>
            <input type="hidden" name="branch_id" value={lockedBranchId} />
            <p className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {lockedBranch?.name ?? "Your branch"}
            </p>
          </>
        ) : (
          <Select name="branch_id" disabled={pending}>
            <SelectTrigger id="branch_id">
              <SelectValue placeholder="Select branch" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((branch: { id: string; name: string }) => (
                <SelectItem key={branch.id} value={branch.id}>
                  {branch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <CustomerPicker
        customers={customers}
        selected={selectedCustomer}
        onSelect={setSelectedCustomer}
        useNewCustomer={useNewCustomer}
        onToggleNewCustomer={(value: boolean) => {
          setUseNewCustomer(value);
          if (value) setSelectedCustomer(null);
        }}
        disabled={pending}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="sale_date">Sale date</Label>
          <Input
            id="sale_date"
            name="sale_date"
            type="date"
            defaultValue={todayIsoDate()}
            disabled={pending}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="or_no">OR no.</Label>
          <Input id="or_no" name="or_no" disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="csi_no">CSI no.</Label>
          <Input id="csi_no" name="csi_no" disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ci_no">CI no.</Label>
          <Input id="ci_no" name="ci_no" disabled={pending} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="referred_by">Referred by (optional)</Label>
          <Input id="referred_by" name="referred_by" disabled={pending} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_paid"
            value="true"
            disabled={pending}
            className="size-4 rounded border-input"
          />
          Paid
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Lines</h2>

        <StockPicker
          stockOptions={stockOptions}
          onAdd={handleAddStock}
          disabled={pending}
        />

        <div className="grid gap-1.5 sm:max-w-md">
          <Label htmlFor="service-select">Add a service</Label>
          <Select
            value={serviceSelectValue || undefined}
            onValueChange={(value: string) => {
              const service = serviceOptions.find(
                (option: SaleServiceOption) => option.id === value,
              );
              if (service) handleAddService(service);
            }}
            disabled={pending}
          >
            <SelectTrigger id="service-select">
              <SelectValue placeholder="Select service" />
            </SelectTrigger>
            <SelectContent>
              {serviceOptions.map((service: SaleServiceOption) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Serial</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Freebie</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No lines yet. Add a product or service above.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((line: DraftLine) => {
                  const qty = Number.parseFloat(line.quantity) || 0;
                  const price = Number.parseFloat(line.unit_price) || 0;
                  return (
                    <TableRow key={line.key}>
                      <TableCell className="font-medium">
                        {line.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {line.line_type === "stock" ? "Product" : "Service"}
                        </span>
                        {line.is_freebie ? (
                          <Badge variant="success" className="ml-2">
                            FREE
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {line.serial_number ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="1"
                          max={line.max_quantity ?? undefined}
                          step="1"
                          value={line.quantity}
                          disabled={pending || line.serial_number !== null}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineChange(line.key, "quantity", event.target.value)
                          }
                          className="ml-auto h-8 w-20 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          disabled={pending || linePricesLocked || line.is_freebie}
                          title={
                            line.is_freebie
                              ? "Freebie — price locked at 0"
                              : linePricesLocked
                                ? "SRP — locked"
                                : isPartnerBranch
                                  ? "Suggested price — editable"
                                  : undefined
                          }
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            handleLineChange(line.key, "unit_price", event.target.value)
                          }
                          className="ml-auto h-8 w-28 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCurrency(qty * price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          disabled={pending}
                          checked={line.is_freebie}
                          onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                            handleToggleFreebie(line.key, event.target.checked)
                          }
                          className="size-4 rounded border-input"
                          aria-label={`Mark ${line.label} as freebie`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => handleRemoveLine(line.key)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="grid gap-3 sm:max-w-md">
          <div className="grid gap-1.5">
            <Label htmlFor="discount_type">Discount</Label>
            <Select
              value={discountType}
              onValueChange={(value: string) => setDiscountType(value as DiscountType)}
              disabled={pending}
            >
              <SelectTrigger id="discount_type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISCOUNT_TYPES.map((type: DiscountType) => (
                  <SelectItem key={type} value={type}>
                    {DISCOUNT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* The Select above is controlled for live recompute; this hidden
                input is what actually submits discount_type in the form. */}
            <input type="hidden" name="discount_type" value={discountType} />
          </div>

          {isScOrPwd ? (
            <div className="grid gap-1.5">
              <Label htmlFor="discount_id_no">
                {discountType === "senior_citizen" ? "Senior Citizen ID no." : "PWD ID no."}
              </Label>
              <Input
                id="discount_id_no"
                name="discount_id_no"
                required
                disabled={pending}
                value={discountIdNo}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDiscountIdNo(event.target.value)
                }
              />
              <p className="text-xs text-muted-foreground">
                Required by BIR for Senior Citizen / PWD VAT-exempt sales (RA 9994 / RA 10754).
              </p>
            </div>
          ) : null}

          {discountType === "final_price" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="final_price">Final sale price (from receipt)</Label>
              <Input
                id="final_price"
                name="final_price"
                type="number"
                min="0"
                step="0.01"
                disabled={pending}
                value={finalPrice}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setFinalPrice(event.target.value)
                }
                className="w-28"
              />
              {finalExceedsGross ? (
                <p className="text-xs font-medium text-destructive">
                  Final price exceeds item total ({formatCurrency(gross)}).
                </p>
              ) : null}
            </div>
          ) : null}

          {discountType === "custom_percent" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="discount_percent">Discount %</Label>
              <Input
                id="discount_percent"
                name="discount_percent"
                type="number"
                min="0"
                max="100"
                step="0.01"
                disabled={pending}
                value={discountPercent}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDiscountPercent(event.target.value)
                }
                className="w-28"
              />
            </div>
          ) : null}

          {discountType === "custom_amount" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="discount_amount">Discount amount</Label>
              <Input
                id="discount_amount"
                name="discount_amount"
                type="number"
                min="0"
                step="0.01"
                disabled={pending}
                value={discountAmount}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setDiscountAmount(event.target.value)
                }
                className="w-28"
              />
              {discountExceedsGross ? (
                <p className="text-xs font-medium text-warning-foreground">
                  Discount exceeds gross total — it will be clamped to {formatCurrency(gross)}.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="vat_exempt"
            value="true"
            checked={vatExempt}
            disabled={pending || isScOrPwd}
            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
              setVatExempt(event.target.checked)
            }
            className="size-4 rounded border-input"
          />
          VAT-exempt sale
          {isScOrPwd ? (
            <span className="text-xs font-normal text-muted-foreground">
              (locked on — Senior Citizen / PWD sales are always VAT-exempt)
            </span>
          ) : null}
        </label>

        {/* Live breakdown — recomputes as lines/mode/inputs change. Server
            recomputes the authoritative values from lines + mode + declared
            number; this is display-only. */}
        <div className="flex flex-col items-end gap-2 text-sm">
          <div className="flex w-full max-w-xs items-center justify-between">
            <span className="text-muted-foreground">
              Items total {isPartnerBranch ? "" : "(SRP)"}
            </span>
            <span className="font-medium tabular-nums">{formatCurrency(gross)}</span>
          </div>
          <div className="flex w-full max-w-xs items-center justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span className="font-medium tabular-nums">-{formatCurrency(discountValue)}</span>
          </div>
          <div className="flex w-full max-w-xs items-center justify-between border-t border-border pt-2">
            <span className="font-semibold">Final price</span>
            <span className="font-semibold tabular-nums">{formatCurrency(finalValue)}</span>
          </div>
          <div className="flex w-full max-w-xs items-center justify-between">
            <span className="text-muted-foreground">VAT</span>
            <span className="font-medium tabular-nums">
              {effectiveVatExempt ? "VAT-exempt" : formatCurrency(vatValue)}
            </span>
          </div>
        </div>
      </div>

      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" disabled={pending || lines.length === 0}>
          {pending ? "Recording..." : "Record sale"}
        </Button>
      </div>
    </form>
  );
}
