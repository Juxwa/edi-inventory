-- Cancel path for reserved (not yet dispatched) transfers: release the
-- reservation and drop the transfer back to draft, where the existing
-- delete-draft flow finishes the cancellation.
--
-- Inverse of transfer_reserve (0009). Reserve either flips a whole
-- stock row to 'reserved' (serialized / full-lot) or splits a partial
-- lot into a new reserved row. Unreserve flips the lines' rows back to
-- 'available'. Split rows are NOT merged back into their parent lot —
-- identifying the parent reliably isn't possible after the fact, and a
-- standalone available lot is harmless (quantities stay correct).
--
-- security invoker: same RLS surface as transfer_reserve — whoever can
-- reserve can unreserve.

create function transfer_unreserve(p_transfer_id uuid)
returns void language plpgsql security invoker as $$
declare v_line record;
begin
  perform 1 from transfers where id = p_transfer_id and status = 'reserved' for update;
  if not found then raise exception 'transfer not reserved'; end if;

  for v_line in select * from transfer_line_items where transfer_id = p_transfer_id loop
    if v_line.stock_id is not null then
      update stock set status = 'available', updated_at = now()
        where id = v_line.stock_id and status = 'reserved';
    end if;
  end loop;

  update transfers set status = 'draft', updated_at = now() where id = p_transfer_id;
end $$;
