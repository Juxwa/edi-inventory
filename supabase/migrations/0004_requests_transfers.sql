create type request_status as enum ('pending','processing','served');

create table inventory_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  requesting_branch_id uuid not null references branches(id),
  requested_by uuid references profiles(id),
  request_date date not null default current_date,
  notes text,
  admin_notes text,
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table request_line_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  request_id uuid not null references inventory_requests(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity numeric not null check (quantity > 0)
);

create type transfer_status as enum ('draft','reserved','in_transit','confirmed');

create table transfers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  code text not null,
  from_branch_id uuid not null references branches(id),
  to_branch_id uuid not null references branches(id),
  transfer_date date,
  received_date date,
  status transfer_status not null default 'draft',
  courier text,
  tracking_code text,
  sis_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_transfers_code on transfers(code);

create table transfer_line_items (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  transfer_id uuid not null references transfers(id) on delete cascade,
  stock_id uuid references stock(id),
  quantity numeric not null default 1,
  serial_snapshot text,
  received_confirmed boolean not null default false,
  received_at timestamptz
);
create index idx_tli_transfer on transfer_line_items(transfer_id);
