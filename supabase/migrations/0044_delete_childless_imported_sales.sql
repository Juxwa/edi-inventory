-- Import self-clean: sale headers created by the importer whose every line
-- failed mapping (blank product/service in Bubble source) carry no amounts
-- and surface as "(no lines)" noise. Callable from the import script after
-- each run. Touches ONLY import-created rows (legacy_id 'sale:%') with zero
-- lines — app-created sales are structurally line-guaranteed by sale_record.
create or replace function delete_childless_imported_sales()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from sales s
  where s.legacy_id like 'sale:%'
    and not exists (select 1 from sale_line_items l where l.sale_id = s.id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Import runs with the service role; no anon/authenticated execution needed.
revoke execute on function delete_childless_imported_sales() from anon;
revoke execute on function delete_childless_imported_sales() from authenticated;
