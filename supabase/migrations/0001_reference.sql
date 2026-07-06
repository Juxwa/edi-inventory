create type user_role as enum ('admin','branch_rep','top_mgmt','technical');

create table branches (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null unique,
  code text not null unique,
  address text,
  email text,
  contact_no text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null unique,
  contact_person text,
  contact_no text,
  email text,
  address text,
  payment_terms text,
  notes text,
  is_active boolean not null default true,
  is_stub boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_categories (
  id serial primary key,
  name text not null unique
);
insert into product_categories (name) values
 ('Hearing Aids'),('Batteries'),('Sound Booth'),('Consumables'),('Parts'),
 ('Hearing Machine'),('Tympanometer'),('Ear Plugs'),('Accessories'),
 ('Accountable Forms'),('Office Assets');

create table products (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null unique,
  code text,
  category_id int references product_categories(id),
  supplier_id uuid references suppliers(id),
  srp numeric(12,2),
  has_serial boolean not null default false,
  description text,
  notes text,
  configurations text[],
  default_configuration text,
  is_active boolean not null default true,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null unique,
  description text,
  is_stub boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table service_pricing (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  branch_id uuid not null references branches(id),
  service_id uuid not null references services(id),
  price numeric(12,2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, service_id)
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  legacy_id text unique,
  name text,
  role user_role not null default 'branch_rep',
  branch_id uuid references branches(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
