"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicTimeline } from "@/components/repair-status/timeline";
import { lookupRepair } from "@/app/repair-status/actions";
import { initialLookupState, type LookupState } from "@/lib/repair-lookup";

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function LookupForm({ initialSar }: { initialSar: string }) {
  const [state, formAction, pending] = useActionState<LookupState, FormData>(
    lookupRepair,
    initialLookupState,
  );

  const result = state.ok ? state.result : undefined;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Check your repair status</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="sar">SAR number</Label>
              <Input
                id="sar"
                name="sar"
                defaultValue={initialSar}
                placeholder="e.g. SAR-260711-A1B2"
                disabled={pending}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="verify">Phone number (or last name)</Label>
              <Input
                id="verify"
                name="verify"
                placeholder="The number you gave at the branch"
                disabled={pending}
                required
              />
            </div>

            {!state.ok && state.error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            ) : null}

            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Checking..." : "Check status"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{result.sar_no}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Received</dt>
                <dd className="font-medium">{formatDate(result.request_date)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Downpayment</dt>
                <dd className="font-medium">
                  {result.downpayment !== null
                    ? currencyFormatter.format(result.downpayment)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Returned</dt>
                <dd className="font-medium">
                  {formatDate(result.returned_to_customer_at)}
                </dd>
              </div>
            </dl>

            <PublicTimeline events={result.events} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
