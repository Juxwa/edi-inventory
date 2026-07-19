import { describe, it, expect } from 'vitest';
import {
  branchChannel,
  channelColumns,
  channelKey,
  messageMatchesChannel,
  type ChatMessageRow,
} from '../src/lib/chat';

const ILOILO = '11111111-1111-1111-1111-111111111111';
const HQ = '22222222-2222-2222-2222-222222222222';

function message(overrides: Partial<ChatMessageRow>): ChatMessageRow {
  return {
    id: 'm1',
    transfer_id: null,
    branch_a_id: null,
    branch_b_id: null,
    sender_id: 'u1',
    body: 'hi',
    created_at: '2026-07-14T00:00:00Z',
    ...overrides,
  };
}

describe('branchChannel', () => {
  it('canonicalizes the pair so argument order does not matter', () => {
    expect(branchChannel(HQ, ILOILO)).toEqual(branchChannel(ILOILO, HQ));
  });

  it('orders the pair ascending to match the DB constraint (a < b)', () => {
    const channel = branchChannel(HQ, ILOILO);
    expect(channel).toEqual({
      kind: 'branches',
      branchAId: ILOILO,
      branchBId: HQ,
    });
  });
});

describe('messageMatchesChannel', () => {
  const pair = branchChannel(HQ, ILOILO);

  it('general matches only messages with no transfer and no pair', () => {
    expect(messageMatchesChannel(message({}), { kind: 'general' })).toBe(true);
    expect(
      messageMatchesChannel(message({ transfer_id: 't1' }), { kind: 'general' }),
    ).toBe(false);
    expect(
      messageMatchesChannel(
        message({ branch_a_id: ILOILO, branch_b_id: HQ }),
        { kind: 'general' },
      ),
    ).toBe(false);
  });

  it('branch pair matches only its own canonical pair', () => {
    expect(
      messageMatchesChannel(
        message({ branch_a_id: ILOILO, branch_b_id: HQ }),
        pair,
      ),
    ).toBe(true);
    expect(messageMatchesChannel(message({}), pair)).toBe(false);
  });

  it('transfer channel matches by transfer id', () => {
    const channel = { kind: 'transfer', transferId: 't1' } as const;
    expect(messageMatchesChannel(message({ transfer_id: 't1' }), channel)).toBe(
      true,
    );
    expect(messageMatchesChannel(message({ transfer_id: 't2' }), channel)).toBe(
      false,
    );
  });
});

describe('channelColumns / channelKey', () => {
  it('round-trips: columns written for a channel match that channel', () => {
    const pair = branchChannel(HQ, ILOILO);
    const row = message(channelColumns(pair));
    expect(messageMatchesChannel(row, pair)).toBe(true);
    expect(messageMatchesChannel(row, { kind: 'general' })).toBe(false);
  });

  it('produces distinct keys per channel', () => {
    expect(channelKey({ kind: 'general' })).not.toBe(
      channelKey(branchChannel(HQ, ILOILO)),
    );
    expect(channelKey({ kind: 'transfer', transferId: 't1' })).not.toBe(
      channelKey({ kind: 'transfer', transferId: 't2' }),
    );
  });
});
