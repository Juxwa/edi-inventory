"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import {
  initialHearingTestState,
  type HearingTestActionState,
} from "@/lib/validators/hearing-test";

export type SaleLinkOption = {
  id: string;
  sale_date: string;
  or_no: string | null;
};

type SaleLinkAction = (
  state: HearingTestActionState,
  formData: FormData,
) => Promise<HearingTestActionState>;

// Extracted from hearing-tests-table.tsx so any visit (not just hearing
// tests) can link/unlink a sale — the server action is passed in so each
// caller keeps its own authorization rules.
export function SaleLinkForm({
  visitId,
  currentSaleId,
  saleOptions,
  action,
}: {
  visitId: string;
  currentSaleId: string | null;
  saleOptions: SaleLinkOption[];
  action: SaleLinkAction;
}) {
  const router = useRouter();
  const [saleId, setSaleId] = useState<string>(currentSaleId ?? "");
  const [state, formAction, pending] = useActionState<HearingTestActionState, FormData>(
    action,
    initialHearingTestState,
  );

  useEffect(() => {
    if (state.ok) {
      toast.success("Sale link updated.");
      router.refresh();
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  if (saleOptions.length === 0) {
    return (
      <div className="grid gap-1">
        <p className="text-sm font-medium">Link to sale</p>
        <p className="text-sm text-muted-foreground">
          This customer has no recorded sales yet.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="visit_id" value={visitId} />
      <input type="hidden" name="sale_id" value={saleId} />
      <label className="text-sm font-medium">Link to sale</label>
      <Select
        value={saleId || "none"}
        onValueChange={(value: string) => setSaleId(value === "none" ? "" : value)}
        disabled={pending}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="No sale linked" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No sale linked</SelectItem>
          {saleOptions.map((sale: SaleLinkOption) => (
            <SelectItem key={sale.id} value={sale.id}>
              {formatDate(sale.sale_date)} — {sale.or_no ?? "No OR no."}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div>
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          {pending ? "Saving..." : "Save sale link"}
        </Button>
      </div>
    </form>
  );
}
