"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile, type Profile } from "@/lib/supabase/profile";
import {
  reviewHearingTestSchema,
  linkVisitSaleSchema,
  type HearingTestActionState,
} from "@/lib/validators/hearing-test";

function firstIssueMessage(issues: { message: string }[]): string {
  return issues[0]?.message ?? "Invalid input.";
}

// Every action re-verifies top_mgmt/admin server-side before writing.
// RLS also grants top_mgmt/admin an explicit UPDATE on visits (0028's
// visits_review_write), but the *practical* gate that keeps a branch_rep
// out of this workflow is this role check: 0012's visits_write already
// lets branch_rep update any visits row's columns (visits carry no
// branch_id to scope RLS against), so the Postgres layer alone can't
// distinguish "branch editing their own visit" from "branch marking a
// review" — belt-and-braces with the RLS grant, same pattern as the
// admin_corrections RPC guards.
async function requireReviewerProfile(): Promise<
  { profile: Profile; denied?: undefined } | { profile?: undefined; denied: HearingTestActionState }
> {
  const profile = await getProfile();
  if (
    !profile ||
    !profile.is_active ||
    (profile.role !== "admin" && profile.role !== "top_mgmt")
  ) {
    return { denied: { ok: false, error: "Not authorized." } };
  }
  return { profile };
}

export async function reviewHearingTest(
  _prevState: HearingTestActionState,
  formData: FormData,
): Promise<HearingTestActionState> {
  // Not destructured: TS discriminated-union narrowing (denied ⇒ no
  // profile, and vice versa) only holds while reading off the same
  // object — destructuring both fields up front would widen `profile`
  // back to `Profile | undefined` after the guard check below.
  const guard = await requireReviewerProfile();
  if (guard.denied) return guard.denied;
  const profile = guard.profile;

  const parsed = reviewHearingTestSchema.safeParse({
    visit_id: formData.get("visit_id"),
    review_notes: formData.get("review_notes"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("visits")
    .update({
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
      review_notes: parsed.data.review_notes,
    })
    .eq("id", parsed.data.visit_id)
    .eq("is_hearing_test", true);

  if (error) {
    return { ok: false, error: "Could not save review." };
  }

  revalidatePath("/hearing-tests");
  return { ok: true };
}

export async function linkVisitSale(
  _prevState: HearingTestActionState,
  formData: FormData,
): Promise<HearingTestActionState> {
  const guard = await requireReviewerProfile();
  if (guard.denied) return guard.denied;

  const parsed = linkVisitSaleSchema.safeParse({
    visit_id: formData.get("visit_id"),
    sale_id: formData.get("sale_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstIssueMessage(parsed.error.issues) };
  }

  const supabase = await createClient();

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("id, customer_id")
    .eq("id", parsed.data.visit_id)
    .single();
  if (visitError || !visit) {
    return { ok: false, error: "Visit not found." };
  }

  // Validate the sale belongs to the same customer as the visit before
  // linking — never trust the picked sale_id blindly.
  if (parsed.data.sale_id) {
    const { data: sale, error: saleError } = await supabase
      .from("sales")
      .select("id, customer_id")
      .eq("id", parsed.data.sale_id)
      .single();
    if (saleError || !sale || sale.customer_id !== visit.customer_id) {
      return { ok: false, error: "That sale does not belong to this customer." };
    }
  }

  const { error } = await supabase
    .from("visits")
    .update({ resulted_in_sale_id: parsed.data.sale_id })
    .eq("id", parsed.data.visit_id)
    .eq("is_hearing_test", true);

  if (error) {
    return { ok: false, error: "Could not link sale." };
  }

  revalidatePath("/hearing-tests");
  return { ok: true };
}
