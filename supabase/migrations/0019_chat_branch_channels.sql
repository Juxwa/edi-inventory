-- Branch-to-branch chat channels. A message now belongs to exactly one of
-- three channel shapes:
--   transfer thread : transfer_id set, branch pair null
--   branch channel  : branch_a_id/branch_b_id set (canonically a < b so each
--                     pair has exactly one channel), transfer_id null
--   general channel : everything null
-- Branch channels are visible only to members of the two branches, plus the
-- head-office roles (admin, top_mgmt) that see everything elsewhere in the app.

alter table chat_messages
  add column branch_a_id uuid references branches(id),
  add column branch_b_id uuid references branches(id);

alter table chat_messages add constraint chat_channel_shape check (
  (transfer_id is not null and branch_a_id is null and branch_b_id is null)
  or (transfer_id is null and branch_a_id is not null and branch_b_id is not null
      and branch_a_id < branch_b_id)
  or (transfer_id is null and branch_a_id is null and branch_b_id is null)
);

create index idx_chat_branch_pair
  on chat_messages(branch_a_id, branch_b_id, created_at);

drop policy chat_read on chat_messages;
drop policy chat_insert on chat_messages;

create policy chat_read on chat_messages for select to authenticated
  using (
    case
      when transfer_id is not null then exists (
        select 1 from transfers t
        where t.id = transfer_id
          and ((select auth_role()) in ('admin', 'top_mgmt')
               or t.from_branch_id = (select auth_branch())
               or t.to_branch_id = (select auth_branch()))
      )
      when branch_a_id is not null then
        (select auth_role()) in ('admin', 'top_mgmt')
        or (select auth_branch()) in (branch_a_id, branch_b_id)
      else (select auth_role()) is not null
    end
  );

create policy chat_insert on chat_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and case
      when transfer_id is not null then exists (
        select 1 from transfers t
        where t.id = transfer_id
          and ((select auth_role()) in ('admin', 'top_mgmt')
               or t.from_branch_id = (select auth_branch())
               or t.to_branch_id = (select auth_branch()))
      )
      when branch_a_id is not null then
        (select auth_role()) in ('admin', 'top_mgmt')
        or (select auth_branch()) in (branch_a_id, branch_b_id)
      else (select auth_role()) is not null
    end
  );
