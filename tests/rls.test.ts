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

describe('RLS branch scoping', () => {
  let branchA: string, branchB: string;
  beforeAll(async () => {
    const { data: a } = await service.from('branches')
      .upsert({ name: 'RLS Test A', code: 'RLSA' }, { onConflict: 'code' }).select().single();
    const { data: b } = await service.from('branches')
      .upsert({ name: 'RLS Test B', code: 'RLSB' }, { onConflict: 'code' }).select().single();
    branchA = a!.id; branchB = b!.id;
    const { data: p } = await service.from('products')
      .upsert({ name: 'RLS Test Product' }, { onConflict: 'name' }).select().single();
    await service.from('stock').insert(
      { product_id: p!.id, branch_id: branchB, quantity: 1, legacy_id: 'rls-test-stock' });
  });

  it('branch_rep of A cannot read branch B stock', async () => {
    const repA = await makeUser('rls-rep-a@test.local', 'branch_rep', branchA);
    const { data } = await repA.from('stock').select('id').eq('legacy_id', 'rls-test-stock');
    expect(data).toEqual([]);
  });

  it('top_mgmt reads all branches', async () => {
    const mgmt = await makeUser('rls-mgmt@test.local', 'top_mgmt', branchA);
    const { data } = await mgmt.from('stock').select('id').eq('legacy_id', 'rls-test-stock');
    expect(data!.length).toBe(1);
  });
});
