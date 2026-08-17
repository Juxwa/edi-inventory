"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { editSale } from "@/app/(app)/admin/corrections/actions";
import {
  initialCorrectionState,
  type CorrectionActionState,
} from "@/lib/validators/correction";

export type SaleEditCustomerOption = {
  id: string;
  name: string;
  mobile_no: string | null;
};

// Admin-only affordance on the sale detail page. Opens a dialog to fix
// mis-keyed OR/CSI/CI numbers, sale date, customer, referred-by, or paid
// flag without voiding the sale — see sale_edit RPC (0050_sale_edit.sql).
// Deliberately does not touch discount/vat/lines/branch/sold_by.
function SaleEditCustomerPicker({
  currentCustomer,
  customerId,
  onSelect,
  disabled,
}: {
  currentCustomer: SaleEditCustomerOption | null;
  customerId: string;
  onSelect: (customer: SaleEditCustomerOption | null) => void;
  disabled: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SaleEditCustomerOption[] | null>(null);
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
        setResults((data as SaleEditCustomerOption[] | null) ?? []);
        setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, supabase]);

  const selectedLabel =
    customerId === currentCustomer?.id
      ? currentCustomer
      : (results?.find((c: SaleEditCustomerOption) => c.id === customerId) ?? null);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor="sale-edit-customer-search">Customer</Label>
        <button
          type="button"
          disabled={disabled || customerId === ""}
          onClick={() => onSelect(null)}
          className="text-sm font-medium text-primary hover:underline disabled:opacity-50"
        >
          Clear (walk-in)
        </button>
      </div>
      <Input
        id="sale-edit-customer-search"
        placeholder="Search by name or mobile"
        value={query}
        disabled={disabled}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
          setQuery(event.target.value)
        }
      />
      <p className="text-sm text-muted-foreground">
        {selectedLabel ? (
          <>
            Selected:{" "}
            <span className="font-medium text-foreground">{selectedLabel.name}</span>
            {selectedLabel.mobile_no ? ` (${selectedLabel.mobile_no})` : ""}
          </>
        ) : (
          "Walk-in (no customer)"
        )}
      </p>
      {query.trim().length >= 2 ? (
        <div className="max-h-40 overflow-y-auto rounded-md border border-border">
          {(results ?? []).length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {searching ? "Searching…" : "No customers match."}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {(results ?? []).map((customer: SaleEditCustomerOption) => (
                <li key={customer.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(customer)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground ${
                      customer.id === customerId
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
      ) : null}
    </div>
  );
}

export function SaleEditDialog({
  saleId,
  currentOrNo,
  currentCsiNo,
  currentCiNo,
  currentSaleDate,
  currentCustomer,
  currentReferredBy,
  currentIsPaid,
}: {
  saleId: string;
  currentOrNo: string | null;
  currentCsiNo: string | null;
  currentCiNo: string | null;
  currentSaleDate: string;
  currentCustomer: SaleEditCustomerOption | null;
  currentReferredBy: string | null;
  currentIsPaid: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [customerId, setCustomerId] = useState(currentCustomer?.id ?? "");
  const [state, formAction, pending] = useActionState<
    CorrectionActionState,
    FormData
  >(editSale, initialCorrectionState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Sale updated.");
      setOpen(false);
      setReason("");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (next) {
          setCustomerId(currentCustomer?.id ?? "");
          setReason("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <PencilIcon className="size-3.5" />
          Edit details
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit sale details</DialogTitle>
          <DialogDescription>
            Fixes the OR/CSI/CI numbers, sale date, customer, referred-by, or
            paid flag recorded on this sale. Discount, VAT, lines, branch,
            and sold-by cannot be changed here.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="sale_id" value={saleId} />
          <input type="hidden" name="customer_id" value={customerId} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="sale-edit-or-no">OR no.</Label>
              <Input
                id="sale-edit-or-no"
                name="or_no"
                defaultValue={currentOrNo ?? ""}
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sale-edit-csi-no">CSI no.</Label>
              <Input
                id="sale-edit-csi-no"
                name="csi_no"
                defaultValue={currentCsiNo ?? ""}
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sale-edit-ci-no">CI no.</Label>
              <Input
                id="sale-edit-ci-no"
                name="ci_no"
                defaultValue={currentCiNo ?? ""}
                disabled={pending}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="sale-edit-date">Sale date</Label>
              <Input
                id="sale-edit-date"
                name="sale_date"
                type="date"
                defaultValue={currentSaleDate}
                disabled={pending}
                required
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-sm font-medium">
              <input
                type="checkbox"
                name="is_paid"
                defaultChecked={currentIsPaid}
                disabled={pending}
                className="size-4 rounded border-input"
              />
              Paid
            </label>
          </div>

          <SaleEditCustomerPicker
            currentCustomer={currentCustomer}
            customerId={customerId}
            onSelect={(customer: SaleEditCustomerOption | null) =>
              setCustomerId(customer?.id ?? "")
            }
            disabled={pending}
          />

          <div className="grid gap-1.5">
            <Label htmlFor="sale-edit-referred-by">Referred by (optional)</Label>
            <Input
              id="sale-edit-referred-by"
              name="referred_by"
              defaultValue={currentReferredBy ?? ""}
              disabled={pending}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="sale-edit-reason">Reason (required)</Label>
            <textarea
              id="sale-edit-reason"
              name="reason"
              rows={2}
              required
              disabled={pending}
              value={reason}
              onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) =>
                setReason(event.target.value)
              }
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Why is this sale being corrected?"
            />
          </div>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending || reason.trim().length === 0}>
              {pending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
