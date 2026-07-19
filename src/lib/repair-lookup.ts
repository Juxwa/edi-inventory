// Pure helpers for the public repair-status lookup. Unit-tested; no I/O.
// Also holds the lookup action's state types — the actions file is
// "use server" and may only export async functions.

export type PublicRepairEvent = {
  status: string;
  note: string | null;
  created_at: string;
};

export type PublicRepairResult = {
  sar_no: string;
  request_date: string;
  status: string;
  downpayment: number | null;
  returned_to_customer_at: string | null;
  events: PublicRepairEvent[];
};

export type LookupState = {
  ok: boolean;
  error?: string;
  result?: PublicRepairResult;
};

export const initialLookupState: LookupState = { ok: false };

// Compare the last 10 digits so +639171234567, 639171234567, and
// 09171234567 all match each other.
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.slice(-10);
}

export type LookupRepair = {
  contact_no: string | null;
};

export type LookupCustomer = {
  name: string | null;
  mobile_no: string | null;
} | null;

// Verify the customer-supplied value against the repair's contact number,
// the customer's mobile, or (fallback) a token of the customer's name.
export function verifyRepairAccess(
  repair: LookupRepair,
  customer: LookupCustomer,
  input: string,
): boolean {
  const trimmed = input.trim();
  if (trimmed.length === 0) return false;

  const inputPhone = normalizePhone(trimmed);
  if (inputPhone.length >= 7) {
    for (const candidate of [repair.contact_no, customer?.mobile_no]) {
      if (candidate && normalizePhone(candidate) === inputPhone) return true;
    }
  }

  // Last-name fallback: input matches a whole word of the customer's name.
  if (customer?.name) {
    const tokens = customer.name.toLowerCase().split(/[\s,]+/);
    if (tokens.includes(trimmed.toLowerCase())) return true;
  }

  return false;
}
