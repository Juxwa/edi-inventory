"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addSalePayment,
  deleteSalePayment,
  type PaymentActionState,
} from "@/app/(app)/sales/actions";

export type PaymentRowData = {
  id: string;
  payment_date: string;
  or_no: string | null;
  method: string | null;
  note: string | null;
  amount: number;
  received_by_name: string | null;
};

const initialState: PaymentActionState = { ok: false };

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

function RecordPaymentDialog({ saleId, balance }: { saleId: string; balance: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(
    addSalePayment,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Payment recorded.");
      setOpen(false);
      setAmount("");
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
        if (next) setAmount("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Record payment</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
          <DialogDescription>
            Remaining balance: {formatCurrency(balance)}. Each payment keeps its
            own OR number.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="sale_id" value={saleId} />

          <div className="grid gap-1.5">
            <Label htmlFor="payment-amount">Amount</Label>
            <Input
              id="payment-amount"
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setAmount(event.target.value)
              }
              disabled={pending}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-date">Date</Label>
            <Input
              id="payment-date"
              name="payment_date"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              disabled={pending}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="payment-or">OR no.</Label>
              <Input id="payment-or" name="or_no" maxLength={100} disabled={pending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="payment-method">Method</Label>
              <Input
                id="payment-method"
                name="method"
                placeholder="Cash / GCash / Card…"
                maxLength={100}
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="payment-note">Note (optional)</Label>
            <Input id="payment-note" name="note" maxLength={1000} disabled={pending} />
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={pending || (Number.parseFloat(amount) || 0) <= 0}
            >
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePaymentButton({ paymentId, saleId }: { paymentId: string; saleId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<PaymentActionState, FormData>(
    deleteSalePayment,
    initialState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Payment deleted.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
        if (!window.confirm("Delete this payment? This cannot be undone.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="sale_id" value={saleId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Delete
      </Button>
    </form>
  );
}

// Payments section on the sale detail page. Sale + stock happen once at
// recording; money arrives here as one or more payments (downpayment,
// installments, final payment), each with its own OR number.
export function PaymentsCard({
  saleId,
  payments,
  netPayable,
  paid,
  balance,
  canRecord,
  isAdmin,
}: {
  saleId: string;
  payments: PaymentRowData[];
  netPayable: number;
  paid: number;
  balance: number;
  canRecord: boolean;
  isAdmin: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Payments</h2>
        {canRecord && balance > 0 ? (
          <RecordPaymentDialog saleId={saleId} balance={balance} />
        ) : null}
      </div>

      {payments.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>OR no.</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Received by</TableHead>
              <TableHead>Note</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {isAdmin ? <TableHead className="w-10" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((payment: PaymentRowData) => (
              <TableRow key={payment.id}>
                <TableCell>{payment.payment_date}</TableCell>
                <TableCell>{payment.or_no ?? "—"}</TableCell>
                <TableCell>{payment.method ?? "—"}</TableCell>
                <TableCell>{payment.received_by_name ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {payment.note ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(payment.amount)}
                </TableCell>
                {isAdmin ? (
                  <TableCell>
                    <DeletePaymentButton paymentId={payment.id} saleId={saleId} />
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-sm text-muted-foreground">
          No payments recorded{balance <= 0 ? " (marked paid at recording)" : ""}.
        </p>
      )}

      <div className="flex flex-col items-end gap-1 text-sm">
        <div className="flex w-full max-w-xs items-center justify-between">
          <span className="text-muted-foreground">Net payable</span>
          <span className="font-medium tabular-nums">{formatCurrency(netPayable)}</span>
        </div>
        <div className="flex w-full max-w-xs items-center justify-between">
          <span className="text-muted-foreground">Total paid</span>
          <span className="font-medium tabular-nums">{formatCurrency(paid)}</span>
        </div>
        <div className="flex w-full max-w-xs items-center justify-between border-t border-border pt-1">
          <span className="font-semibold">Balance due</span>
          <span
            className={`font-semibold tabular-nums ${balance > 0 ? "text-destructive" : ""}`}
          >
            {formatCurrency(balance)}
          </span>
        </div>
      </div>
    </div>
  );
}
