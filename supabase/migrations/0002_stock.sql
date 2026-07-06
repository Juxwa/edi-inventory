create type stock_status as enum
 ('available','transferred','sold','under_repair','for_replacement','consignment','returned');

create table stock (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  product_id uuid not null references products(id),
  supplier_id uuid references suppliers(id),
  branch_id uuid not null references branches(id),
  quantity numeric not null default 0 check (quantity >= 0),
  original_quantity numeric,
  serial_number text,
  status stock_status not null default 'available',
  cost_per_unit numeric(12,2),
  total_cost numeric(14,2),
  supplier_invoice_no text,
  supplier_invoice_date date,
  expiry_date date,
  branch_date_received date,
  is_repair_pool boolean not null default false,
  is_office_asset boolean not null default false,
  return_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_stock_serial on stock(serial_number);
create index idx_stock_product on stock(product_id);
create index idx_stock_branch on stock(branch_id);
create index idx_stock_status on stock(status);

create type movement_type as enum
 ('intake','transfer_out','transfer_in','sale','return','repair_in','repair_out','adjustment');

create table stock_movements (
  id bigserial primary key,
  stock_id uuid not null references stock(id),
  movement_type movement_type not null,
  quantity numeric not null,
  from_branch_id uuid references branches(id),
  to_branch_id uuid references branches(id),
  reference_type text,
  reference_id uuid,
  actor_id uuid references profiles(id),
  occurred_at timestamptz not null default now(),
  note text
);
create index idx_movements_stock on stock_movements(stock_id);

create view stock_aging as
select s.id, s.product_id, s.branch_id, s.serial_number, s.status,
       s.branch_date_received,
       (current_date - coalesce(s.branch_date_received, s.created_at::date)) as days_on_hand
from stock s
where s.status = 'available';
