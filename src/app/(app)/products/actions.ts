"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  productSchema,
  productUpdateSchema,
} from "@/lib/validators/product";

export type ProductActionState = {
  ok: boolean;
  error?: string;
};

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: { code?: string } | null): boolean {
  return !!error && error.code === UNIQUE_VIOLATION;
}

export async function createProduct(
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    code: formData.get("code"),
    category_id: formData.get("category_id"),
    supplier_id: formData.get("supplier_id"),
    srp: formData.get("srp"),
    has_serial: formData.get("has_serial") === "on",
    description: formData.get("description"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("products").insert({
    name: parsed.data.name,
    code: parsed.data.code,
    category_id: parsed.data.category_id,
    supplier_id: parsed.data.supplier_id,
    srp: parsed.data.srp,
    has_serial: parsed.data.has_serial,
    description: parsed.data.description,
    notes: parsed.data.notes,
    is_active: parsed.data.is_active,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Product name already exists." };
    }
    return { ok: false, error: "Could not create product." };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function updateProduct(
  _prevState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const parsed = productUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    code: formData.get("code"),
    category_id: formData.get("category_id"),
    supplier_id: formData.get("supplier_id"),
    srp: formData.get("srp"),
    has_serial: formData.get("has_serial") === "on",
    description: formData.get("description"),
    notes: formData.get("notes"),
    is_active: formData.get("is_active") === "on",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      code: parsed.data.code,
      category_id: parsed.data.category_id,
      supplier_id: parsed.data.supplier_id,
      srp: parsed.data.srp,
      has_serial: parsed.data.has_serial,
      description: parsed.data.description,
      notes: parsed.data.notes,
      is_active: parsed.data.is_active,
    })
    .eq("id", parsed.data.id);

  if (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "Product name already exists." };
    }
    return { ok: false, error: "Could not update product." };
  }

  revalidatePath("/products");
  return { ok: true };
}

export async function setProductArchived(
  id: string,
  archived: boolean,
): Promise<ProductActionState> {
  if (!id) {
    return { ok: false, error: "Missing product id." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ archived })
    .eq("id", id);

  if (error) {
    return { ok: false, error: "Could not update product status." };
  }

  revalidatePath("/products");
  return { ok: true };
}
