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

describe('earmolds', () => {
  let branchA: string, branchB: string;

  beforeAll(async () => {
    const { data: a } = await service.from('branches')
      .upsert({ name: 'Repair Test A', code: 'REPA' }, { onConflict: 'code' }).select().single();
    const { data: b } = await service.from('branches')
      .upsert({ name: 'Repair Test B', code: 'REPB' }, { onConflict: 'code' }).select().single();
    branchA = a!.id; branchB = b!.id;
    await service.from('earmold_requests').delete().like('patient_name', 'EM Test%');
  });

  it('branch rep creates and advances; cross-branch rep sees nothing', async () => {
    const repA = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: created, error } = await repA.from('earmold_requests')
      .insert({ patient_name: 'EM Test Patient', requesting_branch_id: branchA, side: 'left' })
      .select('id, status').single();
    expect(error).toBeNull();
    expect(created!.status).toBe('pending');

    const repB = await makeUser('repair-rep-b@test.local', 'branch_rep', branchB);
    const { data: hidden } = await repB.from('earmold_requests')
      .select('id').eq('id', created!.id);
    expect(hidden).toEqual([]);

    // advance pending -> processing with a stale from_status guard
    const { data: advanced } = await repA.from('earmold_requests')
      .update({ status: 'processing' }).eq('id', created!.id)
      .eq('status', 'pending').select('id');
    expect(advanced!.length).toBe(1);

    // stale advance (still claims pending) is a no-op
    const { data: stale } = await repA.from('earmold_requests')
      .update({ status: 'served' }).eq('id', created!.id)
      .eq('status', 'pending').select('id');
    expect(stale).toEqual([]);
  });
});
