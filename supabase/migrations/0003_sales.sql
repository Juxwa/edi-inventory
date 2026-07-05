create table customers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  mobile_no text,
  email text,
  address text,
  date_of_birth date,
  branch_created_id uuid references branches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customers_mobile on customers(mobile_no);

create table visits (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid not null references customers(id),
  visit_date date not null,
  purpose text,
  purchased_during_visit boolean not null default false,
  remarks text,
  attachment_paths text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table sales (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  customer_id uuid references customers(id),
  branch_id uuid not null references branches(id),
  sold_by uuid references profiles(id),
  sale_date date not null,
  or_no text, csi_no text, ci_no text,
  referred_by text,
  discount numeric(12,2) not null default 0,
  vat_amount numeric(12,2),
  is_paid boolean not null default false,
  transaction_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type line_type as enum ('stock','service');
create type after_sales_status as enum
 ('sold','for_repair','replaced','in_use','returned','partially_returned');

create table sale_line_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  sale_id uuid not null references sales(id) on delete cascade,
  line_type line_type not null,
  stock_id uuid references stock(id),
  service_id uuid references services(id),
  quantity numeric not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null,
  unit_cost numeric(12,2),
  serial_snapshot text,
  warranty_expiry date,
  after_sales_status after_sales_status not null default 'sold',
  return_date date,
  returned_quantity numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (line_type = 'stock' and stock_id is not null and service_id is null) or
    (line_type = 'service' and service_id is not null and stock_id is null)
  )
);
create index idx_sli_sale on sale_line_items(sale_id);

create view sales_totals as
select s.id as sale_id, s.branch_id, s.sale_date,
       sum(l.unit_price * l.quantity) as gross,
       sum(l.unit_price * l.quantity) - s.discount as net_sales
from sales s join sale_line_items l on l.sale_id = s.id
group by s.id;
