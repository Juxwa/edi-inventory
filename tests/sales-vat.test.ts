import { describe, it, expect, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function makeUser(email: string, role: string, branchId: string) {
  const { data, error } = await service.auth.admin.createUser({
    email, password: 'test-password-123', email_confirm: true,
  });
  if (error && !error.message.includes('already')) throw error;
  const uid = data?.user?.id ??
    (await service.from('profiles').select('id').eq('legacy_id', email).single()).data?.id;
  await service.from('profiles').upsert({
    id: uid, legacy_id: email, name: email, role, branch_id: branchId,
  });
  const client = createClient(url, anonKey);
  await client.auth.signInWithPassword({ email, password: 'test-password-123' });
  return client;
}

describe('VAT capture (sale_record) and sales_totals security', () => {
  let branchA: string, branchB: string, productId: string, serviceId: string;

  beforeAll(async () => {
    const { data: a } = await service.from('branches')
      .upsert({ name: 'Repair Test A', code: 'REPA' }, { onConflict: 'code' }).select().single();
    const { data: b } = await service.from('branches')
      .upsert({ name: 'Repair Test B', code: 'REPB' }, { onConflict: 'code' }).select().single();
    branchA = a!.id; branchB = b!.id;
    const { data: p } = await service.from('products')
      .upsert({ name: 'VAT Test Product' }, { onConflict: 'name' }).select().single();
    productId = p!.id;
    const { data: s } = await service.from('services')
      .upsert({ name: 'VAT Test Service' }, { onConflict: 'name' }).select().single();
    serviceId = s!.id;
  });

  async function recordServiceSale(
    client: Awaited<ReturnType<typeof makeUser>>,
    branchId: string,
    vat: number | null,
  ) {
    return client.rpc('sale_record', {
      p_customer_id: null,
      p_branch_id: branchId,
      p_sale_date: '2026-07-11',
      p_or_no: null, p_csi_no: null, p_ci_no: null, p_referred_by: null,
      p_discount: 200,
      p_vat_amount: vat,
      p_is_paid: true,
      p_lines: [{ line_type: 'service', service_id: serviceId, quantity: 1, unit_price: 11200 }],
    });
  }

  it('persists vat_amount and exposes net_of_vat via sales_totals', async () => {
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: saleId, error } = await recordServiceSale(rep, branchA, 1178.57);
    expect(error).toBeNull();

    const { data: totals } = await service.from('sales_totals')
      .select('gross, discount, net_sales, vat_amount, net_of_vat, is_vatable')
      .eq('sale_id', saleId).single();
    expect(Number(totals!.gross)).toBe(11200);
    expect(Number(totals!.net_sales)).toBe(11000);
    expect(Number(totals!.vat_amount)).toBeCloseTo(1178.57);
    expect(Number(totals!.net_of_vat)).toBeCloseTo(9821.43);
    expect(totals!.is_vatable).toBe(true);
  });

  it('accepts null VAT (not captured) and rejects negative VAT', async () => {
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);

    const nullVat = await recordServiceSale(rep, branchA, null);
    expect(nullVat.error).toBeNull();
    const { data: totals } = await service.from('sales_totals')
      .select('vat_amount, net_of_vat, is_vatable').eq('sale_id', nullVat.data).single();
    expect(totals!.vat_amount).toBeNull();
    expect(Number(totals!.net_of_vat)).toBe(11000); // coalesce(null, 0)
    expect(totals!.is_vatable).toBe(false);

    const negative = await recordServiceSale(rep, branchA, -1);
    expect(negative.error?.message).toContain('negative');
  });

  it('sales_totals is branch-scoped for reps and denied to anon (leak regression)', async () => {
    const repA = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: saleId } = await recordServiceSale(repA, branchA, 0);

    const repB = await makeUser('repair-rep-b@test.local', 'branch_rep', branchB);
    const { data: crossBranch } = await repB.from('sales_totals')
      .select('sale_id').eq('sale_id', saleId);
    expect(crossBranch).toEqual([]);

    const anon = createClient(url, anonKey);
    const { data: anonRows, error: anonError } = await anon
      .from('sales_totals').select('sale_id').limit(1);
    expect(anonError !== null || (anonRows ?? []).length === 0).toBe(true);
  });
});
