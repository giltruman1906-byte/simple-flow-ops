-- ============================================================
-- CrossFit Box Dashboard — Leads Schema
-- Run AFTER schema.sql
-- ============================================================

create table if not exists leads (
  id                uuid primary key default uuid_generate_v4(),
  box_id            uuid not null references boxes(id) on delete cascade,
  arbox_lead_id     integer not null,
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  source            text,          -- instagram, referral, website, walk-in, etc.
  status            text not null default 'new'
                    check (status in ('new','in_progress','trial_booked','converted','lost')),
  lost_reason       text,
  trial_date        date,
  created_at        timestamptz not null default now(),
  unique (box_id, arbox_lead_id)
);

create index if not exists leads_box_id_idx     on leads(box_id);
create index if not exists leads_created_at_idx on leads(created_at);
create index if not exists leads_status_idx     on leads(status);

-- RLS
alter table leads enable row level security;

create policy "leads_by_token" on leads
  for select using (
    box_id = get_box_id_from_token(
      (current_setting('request.jwt.claims', true)::json->>'access_token')::uuid
    )
  );

create policy "service_role_leads" on leads
  for all using (auth.role() = 'service_role');
