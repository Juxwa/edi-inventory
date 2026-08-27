"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  setServicePriceSchema,
  clearServicePriceSchema,
  createServiceSchema,
} from "@/lib/validators/pricing";

export type PricingActionState = {
  ok: boolean;
  error?: string;
};

// Creates a new service (admin only — branch roles manage prices, not the
// service catalog). Called through useActionState from AddServiceDialog.
// RLS also restricts services writes to admin (cat_admin_write, 0006), so
// this check is convenience/UX on top of the DB-level rule.
export async function createService(
  _prevState: PricingActionState,
  formData: FormData,
): Promise<PricingActionState> {
  const parsed = createServiceSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return { ok: false, error: "Only admins can add services." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({
    name: parsed.data.name,
    description: parsed.data.description,
  });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "A service with that name already exists." };
    }
    return { ok: false, error: "Could not add service." };
  }

  revalidatePath("/pricing");
  return { ok: true };
}

const PRICING_ROLES = ["admin", "branch_rep", "technical"];

// Sets (upserts) a branch's price for a service. Called directly from the
// pricing table client component (not through a <form action>), matching
// the "click Save on this row" UX — see ServicePricingTable.
//
// Branch users can only ever write their own branch's row: branch_id from
// the caller is IGNORED for non-admins and replaced with the server-side
// profile's branch_id. This is on top of, not instead of, the RLS policy
// (0052_branch_service_pricing.sql) that enforces the same rule at the DB
// level — a crafted request bypassing this action entirely still can't
// write another branch's price.
export async function setServicePrice(
  serviceId: string,
  branchId: string,
  price: number,
): Promise<PricingActionState> {
  const parsed = setServicePriceSchema.safeParse({
    service_id: serviceId,
    branch_id: branchId,
    price,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = await getProfile();
  if (!profile || !PRICING_ROLES.includes(profile.role)) {
    return { ok: false, error: "Not authorized." };
  }

  const isAdmin = profile.role === "admin";
  const effectiveBranchId = isAdmin ? parsed.data.branch_id : profile.branch_id;
  if (!effectiveBranchId) {
    return { ok: false, error: "No branch on this account." };
  }
  if (!isAdmin && parsed.data.branch_id !== profile.branch_id) {
    return { ok: false, error: "You can only set prices for your own branch." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("service_pricing").upsert(
    {
      branch_id: effectiveBranchId,
      service_id: parsed.data.service_id,
      price: parsed.data.price,
    },
    { onConflict: "branch_id,service_id" },
  );

  if (error) {
    return { ok: false, error: "Could not save price." };
  }

  revalidatePath("/pricing");
  return { ok: true };
}

export async function clearServicePrice(
  serviceId: string,
  branchId: string,
): Promise<PricingActionState> {
  const parsed = clearServicePriceSchema.safeParse({
    service_id: serviceId,
    branch_id: branchId,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = await getProfile();
  if (!profile || !PRICING_ROLES.includes(profile.role)) {
    return { ok: false, error: "Not authorized." };
  }

  const isAdmin = profile.role === "admin";
  const effectiveBranchId = isAdmin ? parsed.data.branch_id : profile.branch_id;
  if (!effectiveBranchId) {
    return { ok: false, error: "No branch on this account." };
  }
  if (!isAdmin && parsed.data.branch_id !== profile.branch_id) {
    return { ok: false, error: "You can only clear prices for your own branch." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("service_pricing")
    .delete()
    .eq("branch_id", effectiveBranchId)
    .eq("service_id", parsed.data.service_id);

  if (error) {
    return { ok: false, error: "Could not clear price." };
  }

  revalidatePath("/pricing");
  return { ok: true };
}
