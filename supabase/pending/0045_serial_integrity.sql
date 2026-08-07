-- Business rule (client, 2026-08-06): a serialized item is exactly one
-- physical unit. At most one ACTIVE stock row per serial, and a serialized
-- row's quantity is only ever 0 or 1.
--
-- !! APPLY ONLY AFTER LEGACY CLEANUP !!
-- This migration FAILS (by design) while the data still violates the rule.
-- Sequence: client fixes the flagged rows in Bubble -> re-import -> the two
-- audit queries below return zero rows -> db push applies this file.
--
--   select serial_number from stock
--   where serial_number is not null and quantity > 1;
--
--   select lower(trim(serial_number)) from stock
--   where serial_number is not null and quantity > 0 and status <> 'sold'
--   group by 1 having count(*) > 1;

-- One active row per serial (case/whitespace-insensitive). Historical rows
-- (qty 0) and sold rows are exempt so transfer history and buyback/return
-- flows keep working.
create unique index stock_one_active_serial
  on stock (lower(trim(serial_number)))
  where serial_number is not null
    and quantity > 0
    and status <> 'sold';

-- A serialized row is a single unit: quantity 0 (history) or 1 (the unit).
alter table stock add constraint stock_serialized_single_unit
  check (serial_number is null or quantity <= 1);
