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

describe('repairs', () => {
  let branchA: string, branchB: string;

  beforeAll(async () => {
    const { data: a } = await service.from('branches')
      .upsert({ name: 'Repair Test A', code: 'REPA' }, { onConflict: 'code' }).select().single();
    const { data: b } = await service.from('branches')
      .upsert({ name: 'Repair Test B', code: 'REPB' }, { onConflict: 'code' }).select().single();
    branchA = a!.id; branchB = b!.id;
    // clean up prior runs
    await service.from('repair_requests').delete().like('manual_serial', 'REPTEST-%');
  });

  it('intake generates a SAR and a received event atomically', async () => {
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: repairId, error } = await rep.rpc('repair_intake', {
      p_sar_no: null,
      p_customer_id: null,
      p_contact_no: '09171234567',
      p_branch_id: branchA,
      p_sale_line_item_id: null,
      p_manual_serial: 'REPTEST-001',
      p_issue_description: 'No sound',
      p_assigned_to: null,
      p_downpayment: 500,
      p_initial_note: 'Received at counter',
    });
    expect(error).toBeNull();
    expect(typeof repairId).toBe('string');

    const { data: repair } = await service.from('repair_requests')
      .select('sar_no, status, downpayment').eq('id', repairId).single();
    expect(repair!.sar_no).toMatch(/^SAR-\d{6}-[0-9A-F]{4}$/);
    expect(repair!.status).toBe('pending');

    const { data: events } = await service.from('repair_status_events')
      .select('status, note, is_public').eq('repair_id', repairId);
    expect(events).toHaveLength(1);
    expect(events![0].status).toBe('received');
    expect(events![0].is_public).toBe(true);
  });

  it('manual SAR collision surfaces a clean error', async () => {
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const args = {
      p_sar_no: 'SAR-MANUAL-DUP',
      p_customer_id: null,
      p_contact_no: '09171234567',
      p_branch_id: branchA,
      p_sale_line_item_id: null,
      p_manual_serial: 'REPTEST-002',
      p_issue_description: null,
      p_assigned_to: null,
      p_downpayment: null,
      p_initial_note: null,
    };
    const first = await rep.rpc('repair_intake', args);
    expect(first.error).toBeNull();
    const second = await rep.rpc('repair_intake', { ...args, p_manual_serial: 'REPTEST-003' });
    expect(second.error?.message).toContain('already exists');
  });

  it('returned event completes the repair and stamps the return date', async () => {
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data: repairId } = await rep.rpc('repair_intake', {
      p_sar_no: null, p_customer_id: null, p_contact_no: '09171234567',
      p_branch_id: branchA, p_sale_line_item_id: null,
      p_manual_serial: 'REPTEST-004', p_issue_description: null,
      p_assigned_to: null, p_downpayment: null, p_initial_note: null,
    });

    // status advancement is technical-only since 0033: the rep's attempt is
    // rejected by the repair_add_event guard, then a technical user advances
    const repAttempt = await rep.rpc('repair_add_event', {
      p_repair_id: repairId, p_status: 'in_repair', p_note: null, p_is_public: true,
    });
    expect(repAttempt.error).not.toBeNull();

    const tech = await makeUser('repair-tech@test.local', 'technical', branchA);
    const inRepair = await tech.rpc('repair_add_event', {
      p_repair_id: repairId, p_status: 'in_repair', p_note: null, p_is_public: true,
    });
    expect(inRepair.error).toBeNull();
    let { data: header } = await service.from('repair_requests')
      .select('status, returned_to_customer_at').eq('id', repairId).single();
    expect(header!.status).toBe('in_progress');
    expect(header!.returned_to_customer_at).toBeNull();

    const returned = await tech.rpc('repair_add_event', {
      p_repair_id: repairId, p_status: 'returned', p_note: 'Picked up', p_is_public: true,
    });
    expect(returned.error).toBeNull();
    ({ data: header } = await service.from('repair_requests')
      .select('status, returned_to_customer_at').eq('id', repairId).single());
    expect(header!.status).toBe('completed');
    expect(header!.returned_to_customer_at).not.toBeNull();
  });

  it('RLS: rep of branch B cannot read branch A repairs; technical reads all', async () => {
    const repA = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    await repA.rpc('repair_intake', {
      p_sar_no: null, p_customer_id: null, p_contact_no: '09171234567',
      p_branch_id: branchA, p_sale_line_item_id: null,
      p_manual_serial: 'REPTEST-RLS', p_issue_description: null,
      p_assigned_to: null, p_downpayment: null, p_initial_note: null,
    });

    const repB = await makeUser('repair-rep-b@test.local', 'branch_rep', branchB);
    const { data: hidden } = await repB.from('repair_requests')
      .select('id').eq('manual_serial', 'REPTEST-RLS');
    expect(hidden).toEqual([]);

    const tech = await makeUser('repair-tech@test.local', 'technical', branchB);
    const { data: visible } = await tech.from('repair_requests')
      .select('id').eq('manual_serial', 'REPTEST-RLS');
    expect(visible!.length).toBe(1);
  });

  it('branch rep can list technical profiles (profiles_read)', async () => {
    await makeUser('repair-tech@test.local', 'technical', branchB);
    const rep = await makeUser('repair-rep-a@test.local', 'branch_rep', branchA);
    const { data } = await rep.from('profiles').select('id, name').eq('role', 'technical');
    expect(data!.length).toBeGreaterThan(0);
  });
});

describe('public portal security', () => {
  it('consume_rate_limit allows up to max, denies past it, resets after window', async () => {
    const key = `test:${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      const { data } = await service.rpc('consume_rate_limit', {
        p_key: key, p_max: 3, p_window_seconds: 2,
      });
      expect(data).toBe(true);
    }
    const { data: denied } = await service.rpc('consume_rate_limit', {
      p_key: key, p_max: 3, p_window_seconds: 2,
    });
    expect(denied).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 2100));
    const { data: reset } = await service.rpc('consume_rate_limit', {
      p_key: key, p_max: 3, p_window_seconds: 2,
    });
    expect(reset).toBe(true);
  });

  it('anon key has no access to rate_limits, consume_rate_limit, or repair_requests', async () => {
    const anon = createClient(url, anonKey);

    const table = await anon.from('rate_limits').select('key');
    expect(table.error).not.toBeNull();

    const rpc = await anon.rpc('consume_rate_limit', {
      p_key: 'anon-probe', p_max: 1, p_window_seconds: 60,
    });
    expect(rpc.error).not.toBeNull();

    // Regression: no anon policy may ever creep onto repairs tables.
    const repairs = await anon.from('repair_requests').select('id').limit(1);
    expect(repairs.data ?? []).toEqual([]);
    const events = await anon.from('repair_status_events').select('id').limit(1);
    expect(events.data ?? []).toEqual([]);
  });
});
