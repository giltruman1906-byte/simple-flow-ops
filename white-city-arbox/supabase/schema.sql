-- ============================================================
-- CrossFit Box Dashboard — Supabase Schema
-- Rolling 90-day window | Multi-tenant via access_token
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_cron";

-- ─── boxes ───────────────────────────────────────────────────
-- One row per CrossFit client. Never deleted.
create table if not exists boxes (
  id            uuid primary key default uuid_generate_v4(),
  name          text not null,
  email         text not null,
  access_token  uuid not null unique default uuid_generate_v4(),
  arbox_box_id  integer,
  created_at    timestamptz not null default now()
);

-- ─── members ─────────────────────────────────────────────────
create table if not exists members (
  id               uuid primary key default uuid_generate_v4(),
  box_id           uuid not null references boxes(id) on delete cascade,
  arbox_member_id  integer not null,
  name             text not null,
  email            text,
  phone            text,
  status           text not null default 'active' check (status in ('active','inactive')),
  join_date        date,
  created_at       timestamptz not null default now(),
  unique (box_id, arbox_member_id)
);

create index if not exists members_box_id_idx    on members(box_id);
create index if not exists members_created_at_idx on members(created_at);

-- ─── memberships ─────────────────────────────────────────────
create table if not exists memberships (
  id                    uuid primary key default uuid_generate_v4(),
  box_id                uuid not null references boxes(id) on delete cascade,
  member_id             uuid not null references members(id) on delete cascade,
  arbox_membership_id   integer not null,
  plan_type             text,
  price                 numeric(10,2),
  start_date            date,
  end_date              date,
  status                text not null default 'active' check (status in ('active','expired','cancelled')),
  created_at            timestamptz not null default now(),
  unique (box_id, arbox_membership_id)
);

create index if not exists memberships_box_id_idx    on memberships(box_id);
create index if not exists memberships_created_at_idx on memberships(created_at);

-- ─── payments ────────────────────────────────────────────────
create table if not exists payments (
  id                uuid primary key default uuid_generate_v4(),
  box_id            uuid not null references boxes(id) on delete cascade,
  member_id         uuid not null references members(id) on delete cascade,
  arbox_payment_id  integer not null,
  amount            numeric(10,2) not null,
  status            text not null default 'pending' check (status in ('paid','pending','overdue')),
  payment_date      date,
  created_at        timestamptz not null default now(),
  unique (box_id, arbox_payment_id)
);

create index if not exists payments_box_id_idx    on payments(box_id);
create index if not exists payments_created_at_idx on payments(created_at);

-- ─── classes ─────────────────────────────────────────────────
create table if not exists classes (
  id               uuid primary key default uuid_generate_v4(),
  box_id           uuid not null references boxes(id) on delete cascade,
  arbox_class_id   integer not null,
  name             text not null,
  coach            text,
  scheduled_at     timestamptz,
  max_capacity     integer,
  created_at       timestamptz not null default now(),
  unique (box_id, arbox_class_id)
);

create index if not exists classes_box_id_idx    on classes(box_id);
create index if not exists classes_created_at_idx on classes(created_at);

-- ─── attendance ──────────────────────────────────────────────
create table if not exists attendance (
  id              uuid primary key default uuid_generate_v4(),
  box_id          uuid not null references boxes(id) on delete cascade,
  member_id       uuid not null references members(id) on delete cascade,
  class_id        uuid not null references classes(id) on delete cascade,
  checked_in      boolean not null default true,
  attended_at     timestamptz,
  created_at      timestamptz not null default now(),
  unique (box_id, member_id, class_id)
);

create index if not exists attendance_box_id_idx    on attendance(box_id);
create index if not exists attendance_created_at_idx on attendance(created_at);
create index if not exists attendance_member_id_idx  on attendance(member_id);

-- ============================================================
-- Helper function: resolve box_id from access_token
-- Called by the React app on every dashboard load
-- ============================================================
create or replace function get_box_id_from_token(token uuid)
returns uuid
language sql
security definer
stable
as $$
  select id from boxes where access_token = token limit 1;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table members     enable row level security;
alter table memberships enable row level security;
alter table payments    enable row level security;
alter table classes     enable row level security;
alter table attendance  enable row level security;

-- members
create policy "members_by_token" on members
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

-- memberships
create policy "memberships_by_token" on memberships
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

-- payments
create policy "payments_by_token" on payments
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

-- classes
create policy "classes_by_token" on classes
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

-- attendance
create policy "attendance_by_token" on attendance
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

-- service role bypasses RLS (used by Python sync)
create policy "service_role_members"     on members     for all using (auth.role() = 'service_role');
create policy "service_role_memberships" on memberships for all using (auth.role() = 'service_role');
create policy "service_role_payments"    on payments    for all using (auth.role() = 'service_role');
create policy "service_role_classes"     on classes     for all using (auth.role() = 'service_role');
create policy "service_role_attendance"  on attendance  for all using (auth.role() = 'service_role');

-- ============================================================
-- pg_cron: delete records older than 90 days — runs daily 2am
-- ============================================================
select cron.schedule(
  'cleanup-old-records',
  '0 2 * * *',
  $$
    delete from attendance   where created_at < now() - interval '90 days';
    delete from payments     where created_at < now() - interval '90 days';
    delete from memberships  where created_at < now() - interval '90 days';
    delete from classes      where created_at < now() - interval '90 days';
    delete from members      where created_at < now() - interval '90 days';
  $$
);
