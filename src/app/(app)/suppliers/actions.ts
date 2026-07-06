"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  supplierSchema,
  supplierUpdateSchema,
} from "@/lib/validators/supplier";

export type SupplierActionState = {
  ok: boolean;
  error?: string;
};

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return !!error && error.code === UNIQUE_VIOLATION;
}

export async function createSupplier(
  _prevState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const parsed = supplierSchema.safeParse({
    name: formData.get("name"),
    contact_person: formData.get("contact_person"),
    contact_no: formData.get("contact_no"),
    email: formData.get("email"),
    address: formData.get("address"),
    payment_terms: formData.get("payment_terms"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    name: parsed.data.name,
    contact_person: parsed.data.contact_person,
    contact_no: parsed.data.contact_no,
    email: parsed.data.email,
    address: parsed.data.address,
    payment_terms: parsed.data.payment_terms,
    notes: parsed.data.notes,
    is_active: parsed.data.is_active,
    is_stub: false,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Supplier name already exists." };
    }
    return { ok: false, error: "Could not create supplier." };
  }

  revalidatePath("/suppliers");
  return { ok: true };
}

export async function updateSupplier(
  _prevState: SupplierActionState,
  formData: FormData,
): Promise<SupplierActionState> {
  const parsed = supplierUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    contact_person: formData.get("contact_person"),
    contact_no: formData.get("contact_no"),
    email: formData.get("email"),
    address: formData.get("address"),
    payment_terms: formData.get("payment_terms"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      contact_person: parsed.data.contact_person,
      contact_no: parsed.data.contact_no,
      email: parsed.data.email,
      address: parsed.data.address,
      payment_terms: parsed.data.payment_terms,
      notes: parsed.data.notes,
      is_active: parsed.data.is_active,
      is_stub: false,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Supplier name already exists." };
    }
    return { ok: false, error: "Could not update supplier." };
  }

  revalidatePath("/suppliers");
  return { ok: true };
}

export async function setSupplierArchived(
  id: string,
  isActive: boolean,
): Promise<SupplierActionState> {
  if (!id) {
    return { ok: false, error: "Missing supplier id." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not update supplier status." };
  }

  revalidatePath("/suppliers");
  return { ok: true };
}
