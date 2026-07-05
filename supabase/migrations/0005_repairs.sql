create type repair_status as enum ('pending','in_progress','for_replacement','completed');
create type repair_event_status as enum ('received','assessed','in_repair','ready','returned');
create type ear_side as enum ('left','right','both');

create table repair_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  sar_no text unique,
  customer_id uuid references customers(id),
  contact_no text,
  requesting_branch_id uuid references branches(id),
  requested_by uuid references profiles(id),
  request_date date not null default current_date,
  sale_line_item_id uuid references sale_line_items(id),
  manual_serial text,
  issue_description text,
  assigned_to uuid references profiles(id),
  downpayment numeric(12,2),
  status repair_status not null default 'pending',
  returned_to_customer_at date,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (sale_line_item_id is not null or manual_serial is not null)
);
create index idx_repairs_sar on repair_requests(sar_no);

create table repair_status_events (
  id bigserial primary key,
  repair_id uuid not null references repair_requests(id) on delete cascade,
  status repair_event_status not null,
  note text,
  is_public boolean not null default true,
  actor_id uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index idx_rse_repair on repair_status_events(repair_id);

create table earmold_requests (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  patient_name text not null,
  contact_no text,
  address text,
  hearing_aid_model text,
  side ear_side,
  serial_no text,
  remarks text,
  requesting_branch_id uuid references branches(id),
  requested_by uuid references profiles(id),
  status request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
