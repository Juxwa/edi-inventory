"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/profile";
import {
  customerSchema,
  customerUpdateSchema,
  logVisitSchema,
  type CustomerActionState,
  type VisitActionState,
} from "@/lib/validators/customer";
import {
  linkVisitSaleSchema,
  type HearingTestActionState,
} from "@/lib/validators/hearing-test";

const VISIT_FILES_BUCKET = "visit-files";

// Keeps storage paths predictable and safe: alphanumerics, dot, underscore, hyphen only.
function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "file";
}

export async function createCustomer(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = customerSchema.safeParse({
    name: formData.get("name"),
    mobile_no: formData.get("mobile_no"),
    email: formData.get("email"),
    address: formData.get("address"),
    date_of_birth: formData.get("date_of_birth"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "Not signed in." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: parsed.data.name,
      mobile_no: parsed.data.mobile_no,
      email: parsed.data.email,
      address: parsed.data.address,
      date_of_birth: parsed.data.date_of_birth,
      branch_created_id: profile.branch_id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create customer." };
  }

  revalidatePath("/customers");
  return { ok: true, customerId: data.id };
}

export async function updateCustomer(
  _prevState: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = customerUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    mobile_no: formData.get("mobile_no"),
    email: formData.get("email"),
    address: formData.get("address"),
    date_of_birth: formData.get("date_of_birth"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("customers")
    .update({
      name: parsed.data.name,
      mobile_no: parsed.data.mobile_no,
      email: parsed.data.email,
      address: parsed.data.address,
      date_of_birth: parsed.data.date_of_birth,
    })
    .eq("id", parsed.data.id);

  if (error) {
    return { ok: false, error: "Could not update customer." };
  }

  revalidatePath("/customers");
  revalidatePath(`/customers/${parsed.data.id}`);
  return { ok: true, customerId: parsed.data.id };
}

export async function logVisit(
  _prevState: VisitActionState,
  formData: FormData,
): Promise<VisitActionState> {
  const parsed = logVisitSchema.safeParse({
    customer_id: formData.get("customer_id"),
    visit_date: formData.get("visit_date"),
    purpose: formData.get("purpose"),
    purchased_during_visit: formData.get("purchased_during_visit"),
    is_hearing_test: formData.get("is_hearing_test"),
    remarks: formData.get("remarks"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const profile = await getProfile();
  if (!profile) {
    return { ok: false, error: "Not signed in." };
  }

  const supabase = await createClient();

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .insert({
      customer_id: parsed.data.customer_id,
      visit_date: parsed.data.visit_date,
      purpose: parsed.data.purpose,
      purchased_during_visit: parsed.data.purchased_during_visit,
      is_hearing_test: parsed.data.is_hearing_test,
      remarks: parsed.data.remarks,
      branch_id: profile.branch_id,
      logged_by: profile.id,
    })
    .select("id")
    .single();

  if (visitError || !visit) {
    return { ok: false, error: "Could not log visit." };
  }

  const files = formData
    .getAll("files")
    .filter((entry: FormDataEntryValue): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    revalidatePath(`/customers/${parsed.data.customer_id}`);
    return { ok: true };
  }

  const attachmentPaths: string[] = [];
  let uploadFailures = 0;

  for (const file of files) {
    const path = `${parsed.data.customer_id}/${visit.id}/${sanitizeFilename(file.name)}`;
    const buffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(VISIT_FILES_BUCKET)
      .upload(path, buffer, { contentType: file.type });

    if (uploadError) {
      uploadFailures += 1;
    } else {
      attachmentPaths.push(path);
    }
  }

  if (attachmentPaths.length > 0) {
    await supabase
      .from("visits")
      .update({ attachment_paths: attachmentPaths })
      .eq("id", visit.id);
  }

  revalidatePath(`/customers/${parsed.data.customer_id}`);

  if (uploadFailures > 0) {
    return {
      ok: true,
      warning: `Visit logged, but ${uploadFailures} file(s) failed to upload.`,
    };
  }

  return { ok: true };
}

// Generic sale-link, open to any active profile (branch_rep included) —
// unlike hearing-tests/actions.ts's linkVisitSale, this has no
// is_hearing_test gate and no reviewer-role restriction. Keeps
// resulted_in_sale_id and purchased_during_visit in sync: linking sets
// both, unlinking (sale_id null) clears both.
export async function linkSaleToVisit(
  _prevState: HearingTestActionState,
  formData: FormData,
): Promise<HearingTestActionState> {
  const profile = await getProfile();
  if (!profile || !profile.is_active) {
    return { ok: false, error: "Not authorized." };
  }

  const parsed = linkVisitSaleSchema.safeParse({
    visit_id: formData.get("visit_id"),
    sale_id: formData.get("sale_id"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
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
    .update({
      resulted_in_sale_id: parsed.data.sale_id,
      purchased_during_visit: parsed.data.sale_id !== null,
    })
    .eq("id", parsed.data.visit_id);

  if (error) {
    return { ok: false, error: "Could not link sale." };
  }

  revalidatePath(`/customers/${visit.customer_id}`);
  return { ok: true };
}
