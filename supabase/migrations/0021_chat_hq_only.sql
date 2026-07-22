-- Phase 6 item 4: chat is HQ <-> branch only, no branch-to-branch. Mark the
-- head-office branch explicitly (not name-matching) and tighten the
-- chat_messages INSERT policy so a branch-pair message must include a
-- head-office branch on one side. Existing branch-to-branch rows are left in
-- place as history; they simply become unreachable via the UI and any new
-- attempt to write one is rejected by RLS.

alter table branches
  add column if not exists is_head_office boolean not null default false;

update branches set is_head_office = true where code = 'HQ';

drop policy chat_insert on chat_messages;

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
        (
          (select auth_role()) in ('admin', 'top_mgmt')
          or (select auth_branch()) in (branch_a_id, branch_b_id)
        )
        and exists (
          select 1 from branches b
          where b.id in (branch_a_id, branch_b_id) and b.is_head_office
        )
      else (select auth_role()) is not null
    end
  );
