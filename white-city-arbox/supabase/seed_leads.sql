-- ============================================================
-- CrossFit Box Dashboard — Leads Seed Data
-- Run AFTER schema_leads.sql
-- ============================================================

insert into leads (box_id, arbox_lead_id, first_name, last_name, email, phone, source, status, lost_reason, trial_date, created_at)
values
  -- Converted leads (became members)
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5001, 'Tamir',   'Cohen',    'tamir@test.com',   '050-1010101', 'Instagram',  'converted',    null,                  now()-interval '75 days', now()-interval '80 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5002, 'Roni',    'Levi',     'roni@test.com',    '050-2020202', 'Referral',   'converted',    null,                  now()-interval '68 days', now()-interval '72 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5003, 'Shira',   'Mizrahi',  'shira2@test.com',  '050-3030303', 'Website',    'converted',    null,                  now()-interval '60 days', now()-interval '65 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5004, 'Ido',     'Ben-David', 'ido@test.com',    '050-4040404', 'Instagram',  'converted',    null,                  now()-interval '52 days', now()-interval '57 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5005, 'Neta',    'Shapiro',  'neta@test.com',    '050-5050505', 'Walk-in',    'converted',    null,                  now()-interval '44 days', now()-interval '48 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5006, 'Yossi',   'Peretz',   'yossi@test.com',   '050-6060606', 'Facebook',   'converted',    null,                  now()-interval '35 days', now()-interval '40 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5007, 'Michal',  'Goldberg', 'michal2@test.com', '050-7070707', 'Referral',   'converted',    null,                  now()-interval '25 days', now()-interval '30 days'),

  -- Lost leads
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5008, 'Alon',    'Katz',     'alon@test.com',    '052-1010101', 'Instagram',  'lost',         'Price too high',      now()-interval '70 days', now()-interval '75 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5009, 'Tali',    'Friedman', 'tali@test.com',    '052-2020202', 'Website',    'lost',         'No time',             now()-interval '62 days', now()-interval '67 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5010, 'Dani',    'Ofer',     'dani@test.com',    '052-3030303', 'Facebook',   'lost',         'Joined competitor',   now()-interval '50 days', now()-interval '54 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5011, 'Galit',   'Weiss',    'galit@test.com',   '052-4040404', 'Referral',   'lost',         'Price too high',      now()-interval '40 days', now()-interval '45 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5012, 'Nimrod',  'Segal',    'nimrod@test.com',  '052-5050505', 'Walk-in',    'lost',         'No time',             now()-interval '28 days', now()-interval '33 days'),

  -- Trial booked (in progress)
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5013, 'Hadas',   'Aviram',   'hadas@test.com',   '054-1010101', 'Instagram',  'trial_booked', null,                  now()+interval '2 days',  now()-interval '5 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5014, 'Elad',    'Nachum',   'elad@test.com',    '054-2020202', 'Referral',   'trial_booked', null,                  now()+interval '4 days',  now()-interval '3 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5015, 'Inbal',   'Blum',     'inbal@test.com',   '054-3030303', 'Website',    'trial_booked', null,                  now()+interval '6 days',  now()-interval '2 days'),

  -- In progress (contacted, no trial yet)
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5016, 'Omer',    'Dayan',    'omer@test.com',    '054-4040404', 'Instagram',  'in_progress',  null,                  null,                     now()-interval '7 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5017, 'Liron',   'Ben-Ami',  'liron@test.com',   '054-5050505', 'Facebook',   'in_progress',  null,                  null,                     now()-interval '4 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5018, 'Stav',    'Shapira',  'stav@test.com',    '054-6060606', 'Walk-in',    'in_progress',  null,                  null,                     now()-interval '2 days'),

  -- New (just came in)
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5019, 'Yam',     'Cohen',    'yam@test.com',     '054-7070707', 'Instagram',  'new',          null,                  null,                     now()-interval '1 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 5020, 'Noa',     'Levi',     'noa2@test.com',    '054-8080808', 'Referral',   'new',          null,                  null,                     now())

on conflict (box_id, arbox_lead_id) do nothing;

-- ─── Result ──────────────────────────────────────────────────
select
  count(*)                                                        as total_leads,
  count(*) filter (where status = 'converted')                    as converted,
  count(*) filter (where status = 'lost')                         as lost,
  count(*) filter (where status = 'trial_booked')                 as trial_booked,
  count(*) filter (where status = 'in_progress')                  as in_progress,
  count(*) filter (where status = 'new')                          as new,
  round(count(*) filter (where status = 'converted')::numeric /
        count(*)::numeric * 100, 1)                               as conversion_rate_pct
from leads
where box_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
