-- Legacy transfer line items imported from Bubble don't always resolve to a
-- stock row (consumables have no serial; some serials are ambiguous across
-- branches). product_id preserves what the line was so the UI can still name
-- it when stock_id is null. App-created lines keep using stock_id.
alter table transfer_line_items add column if not exists product_id uuid references products(id);
