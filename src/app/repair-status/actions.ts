"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyRepairAccess, type LookupState } from "@/lib/repair-lookup";

// One generic message for every failure path (unknown SAR, wrong phone,
// rate-limited): callers must not be able to tell which check failed.
const GENERIC_ERROR =
  "No repair found for those details. Check the SAR number and phone number and try again.";

const lookupSchema = z.object({
  sar: z.string().trim().min(1),
  verify: z.string().trim().min(1),
});

export async function lookupRepair(
  _prevState: LookupState,
  formData: FormData,
): Promise<LookupState> {
  const parsed = lookupSchema.safeParse({
    sar: formData.get("sar"),
    verify: formData.get("verify"),
  });
  if (!parsed.success) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const sar = parsed.data.sar.toUpperCase();
  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";

  const admin = createAdminClient();

  // Per-IP limit bounds SAR enumeration; per-SAR limit is the real backstop
  // against brute-forcing the phone verification for a known SAR.
  const [ipLimit, sarLimit] = await Promise.all([
    admin.rpc("consume_rate_limit", {
      p_key: `ip:${ip}`,
      p_max: 10,
      p_window_seconds: 600,
    }),
    admin.rpc("consume_rate_limit", {
      p_key: `sar:${sar}`,
      p_max: 5,
      p_window_seconds: 3600,
    }),
  ]);
  if (ipLimit.error || sarLimit.error || !ipLimit.data || !sarLimit.data) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const { data: repair } = await admin
    .from("repair_requests")
    .select(
      "id, sar_no, contact_no, customer_id, request_date, status, downpayment, returned_to_customer_at",
    )
    .eq("sar_no", sar)
    .is("voided_at", null)
    .maybeSingle();

  if (!repair) {
    return { ok: false, error: GENERIC_ERROR };
  }

  let customer: { name: string | null; mobile_no: string | null } | null = null;
  if (repair.customer_id) {
    const { data } = await admin
      .from("customers")
      .select("name, mobile_no")
      .eq("id", repair.customer_id)
      .maybeSingle();
    customer = data;
  }

  if (!verifyRepairAccess(repair, customer, parsed.data.verify)) {
    return { ok: false, error: GENERIC_ERROR };
  }

  const { data: events } = await admin
    .from("repair_status_events")
    .select("status, note, created_at")
    .eq("repair_id", repair.id)
    .eq("is_public", true)
    .order("created_at", { ascending: true });

  return {
    ok: true,
    result: {
      sar_no: repair.sar_no,
      request_date: repair.request_date,
      status: repair.status,
      downpayment: repair.downpayment,
      returned_to_customer_at: repair.returned_to_customer_at,
      events: (events ?? []).map(
        (event: { status: string; note: string | null; created_at: string }) => ({
          status: event.status,
          note: event.note,
          created_at: event.created_at,
        }),
      ),
    },
  };
}
