-- App-created transfer lines predating the product_id snapshot (added to the
-- addLine action alongside this migration) only carry stock_id. The receiving
-- branch can't read the origin branch's stock through stock_visible while the
-- transfer is in transit, so those lines rendered nameless for them. Backfill
-- the snapshot from the linked stock row.
update transfer_line_items l
set product_id = s.product_id
from stock s
where l.stock_id = s.id
  and l.product_id is null;
