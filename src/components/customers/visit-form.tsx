"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logVisit } from "@/app/(app)/customers/actions";
import {
  initialVisitState,
  VISIT_PURPOSES,
  type VisitActionState,
} from "@/lib/validators/customer";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function VisitForm({ customerId }: { customerId: string }) {
  const [state, formAction, pending] = useActionState<VisitActionState, FormData>(
    logVisit,
    initialVisitState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [purpose, setPurpose] = useState<string>(VISIT_PURPOSES[0]);

  useEffect(() => {
    if (state.ok) {
      toast.success("Visit logged.");
      if (state.warning) {
        toast.warning(state.warning);
      }
      formRef.current?.reset();
      setPurpose(VISIT_PURPOSES[0]);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a visit</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={formRef} action={formAction} className="grid gap-4">
          <input type="hidden" name="customer_id" value={customerId} />
          <input type="hidden" name="purpose" value={purpose} />

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="visit_date">Visit date</Label>
              <Input
                id="visit_date"
                name="visit_date"
                type="date"
                required
                disabled={pending}
                defaultValue={todayDate()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="purpose_select">Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose} disabled={pending}>
                <SelectTrigger id="purpose_select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VISIT_PURPOSES.map((option: string) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="remarks">Remarks</Label>
            <textarea
              id="remarks"
              name="remarks"
              rows={3}
              disabled={pending}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="files">Attachments (photos, PDFs)</Label>
            <input
              id="files"
              name="files"
              type="file"
              multiple
              accept="image/*,.pdf"
              disabled={pending}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs file:mr-2 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="purchased_during_visit"
              value="true"
              disabled={pending}
              className="size-4 rounded border-input"
            />
            Purchase made during this visit
          </label>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="is_hearing_test"
              value="true"
              disabled={pending}
              className="size-4 rounded border-input"
            />
            This is a hearing test (attach the test file above so top
            management can review it)
          </label>

          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving..." : "Log visit"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
