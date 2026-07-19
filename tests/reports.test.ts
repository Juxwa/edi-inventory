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

describe('report views', () => {
  let branchA: string, branchB: string, stockId: string;

  beforeAll(async () => {
    const { data: a } = await service.from('branches')
      .upsert({ name: 'Repair Test A', code: 'REPA' }, { onConflict: 'code' }).select().single();
    const { data: b } = await service.from('branches')
      .upsert({ name: 'Repair Test B', code: 'REPB' }, { onConflict: 'code' }).select().single();
    branchA = a!.id; branchB = b!.id;
    const { data: p } = await service.from('products')
      .upsert({ name: 'Report Test Product' }, { onConflict: 'name' }).select().single();
    const { data: s } = await service.from('stock').insert({
      product_id: p!.id, branch_id: branchA, quantity: 5, status: 'available',
    }).select('id').single();
    stockId = s!.id;
    await service.from('stock_movements').delete().like('note', 'report-test%');
    // sale movement: from_branch_id set, to null (matches sale_record's insert)
    await service.from('stock_movements').insert({
      stock_id: stockId, movement_type: 'sale', quantity: 1,
      from_branch_id: branchA, reference_type: 'sale', note: 'report-test',
    });
    // return movement: to_branch_id set (matches sale_return_line's insert)
    await service.from('stock_movements').insert({
      stock_id: stockId, movement_type: 'return', quantity: 1,
      to_branch_id: branchA, reference_type: 'sale', note: 'report-test',
    });
  });

  it('movements_ledger attributes sale and return to the selling branch', async () => {
    const { data } = await service.from('movements_ledger')
      .select('movement_type, branch_id').eq('note', 'report-test');
    expect(data!.length).toBe(2);
    for (const row of data!) {
      expect(row.branch_id).toBe(branchA);
    }
  });

  it('movements_ledger is branch-scoped for reps', async () => {
    const repB = await makeUser('repair-rep-b@test.local', 'branch_rep', branchB);
    const { data } = await repB.from('movements_ledger')
      .select('id').eq('note', 'report-test');
    expect(data).toEqual([]);

    const repA = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: visible } = await repA.from('movements_ledger')
      .select('id').eq('note', 'report-test');
    expect(visible!.length).toBe(2);
  });

  it('sales_by_month is branch-scoped and both views are denied to anon', async () => {
    const repB = await makeUser('repair-rep-b@test.local', 'branch_rep', branchB);
    const { data: months } = await repB.from('sales_by_month')
      .select('branch_id').eq('branch_id', branchA);
    expect(months).toEqual([]);

    const anon = createClient(url, anonKey);
    const ledger = await anon.from('movements_ledger').select('id').limit(1);
    expect(ledger.error !== null || (ledger.data ?? []).length === 0).toBe(true);
    const monthly = await anon.from('sales_by_month').select('month').limit(1);
    expect(monthly.error !== null || (monthly.data ?? []).length === 0).toBe(true);
  });

  it('rep still sees a transfer_out movement after the stock row moved branches', async () => {
    // simulate: stock now owned by branch B, but the movement happened at A
    await service.from('stock_movements').insert({
      stock_id: stockId, movement_type: 'transfer_out', quantity: 1,
      from_branch_id: branchA, to_branch_id: branchB, note: 'report-test-xfer',
    });
    await service.from('stock').update({ branch_id: branchB }).eq('id', stockId);

    const repA = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data } = await repA.from('movements_ledger')
      .select('id, product_id').eq('note', 'report-test-xfer');
    // left join keeps the movement row even when stock RLS hides the joined row
    expect(data!.length).toBe(1);

    await service.from('stock').update({ branch_id: branchA }).eq('id', stockId);
  });
});
