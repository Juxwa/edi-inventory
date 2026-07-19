-- In-app chat: one table serves two kinds of threads.
--   transfer_id null  -> the organization-wide "General" channel
--   transfer_id set   -> a discussion thread pinned to that transfer
-- Messages are immutable (no update/delete policies) so threads double as an
-- audit trail of what was agreed about a transfer.

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid references transfers(id) on delete cascade,
  sender_id uuid not null references profiles(id),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index idx_chat_transfer on chat_messages(transfer_id, created_at);
create index idx_chat_general on chat_messages(created_at) where transfer_id is null;

alter table chat_messages enable row level security;

-- General channel: every active user. Transfer threads: same audience as the
-- transfers_all read policy (head office roles plus both branches involved),
-- so anyone who can open the transfer can read and join its thread.
create policy chat_read on chat_messages for select to authenticated
  using (
    case
      when transfer_id is null then (select auth_role()) is not null
      else exists (
        select 1 from transfers t
        where t.id = transfer_id
          and ((select auth_role()) in ('admin', 'top_mgmt')
               or t.from_branch_id = (select auth_branch())
               or t.to_branch_id = (select auth_branch()))
      )
    end
  );

create policy chat_insert on chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and case
      when transfer_id is null then (select auth_role()) is not null
      else exists (
        select 1 from transfers t
        where t.id = transfer_id
          and ((select auth_role()) in ('admin', 'top_mgmt')
               or t.from_branch_id = (select auth_branch())
               or t.to_branch_id = (select auth_branch()))
      )
    end
  );

-- Stream inserts to clients over Supabase Realtime (RLS still applies per
-- subscriber, so branch users never receive other branches' transfer threads).
alter publication supabase_realtime add table chat_messages;
