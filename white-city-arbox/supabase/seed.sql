-- ============================================================
-- CrossFit Box Dashboard — Seed Data
-- 1 test box + 90 days of realistic fake data
-- Run AFTER schema.sql
-- ============================================================

-- ─── Test box ────────────────────────────────────────────────
insert into boxes (id, name, email, access_token, arbox_box_id)
values (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'CrossFit White City (Test)',
  'owner@crossfitwhitecity.com',
  '00000000-0000-0000-0000-000000000001',
  48
)
on conflict (id) do nothing;

-- ─── Members (20 fake members) ───────────────────────────────
insert into members (id, box_id, arbox_member_id, name, email, phone, status, join_date, created_at)
values
  ('00000000-0000-0000-0001-000000000001', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1001, 'Lior Cohen',     'lior@test.com',   '050-1111111', 'active',   now()-interval '80 days', now()-interval '80 days'),
  ('00000000-0000-0000-0001-000000000002', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1002, 'Maya Shapiro',   'maya@test.com',   '050-2222222', 'active',   now()-interval '75 days', now()-interval '75 days'),
  ('00000000-0000-0000-0001-000000000003', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1003, 'Eran Levi',      'eran@test.com',   '050-3333333', 'active',   now()-interval '70 days', now()-interval '70 days'),
  ('00000000-0000-0000-0001-000000000004', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1004, 'Noa Goldberg',   'noa@test.com',    '050-4444444', 'active',   now()-interval '65 days', now()-interval '65 days'),
  ('00000000-0000-0000-0001-000000000005', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1005, 'Avi Mizrahi',    'avi@test.com',    '050-5555555', 'active',   now()-interval '60 days', now()-interval '60 days'),
  ('00000000-0000-0000-0001-000000000006', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1006, 'Dana Peretz',    'dana@test.com',   '050-6666666', 'active',   now()-interval '55 days', now()-interval '55 days'),
  ('00000000-0000-0000-0001-000000000007', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1007, 'Yoav Ben-David', 'yoav@test.com',   '050-7777777', 'active',   now()-interval '50 days', now()-interval '50 days'),
  ('00000000-0000-0000-0001-000000000008', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1008, 'Hila Friedman',  'hila@test.com',   '050-8888888', 'active',   now()-interval '45 days', now()-interval '45 days'),
  ('00000000-0000-0000-0001-000000000009', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1009, 'Ron Katz',       'ron@test.com',    '050-9999999', 'active',   now()-interval '40 days', now()-interval '40 days'),
  ('00000000-0000-0000-0001-000000000010', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1010, 'Shira Levy',     'shira@test.com',  '052-1111111', 'active',   now()-interval '35 days', now()-interval '35 days'),
  ('00000000-0000-0000-0001-000000000011', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1011, 'Gal Ofer',       'gal@test.com',    '052-2222222', 'active',   now()-interval '30 days', now()-interval '30 days'),
  ('00000000-0000-0000-0001-000000000012', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1012, 'Tamar Segal',    'tamar@test.com',  '052-3333333', 'active',   now()-interval '25 days', now()-interval '25 days'),
  ('00000000-0000-0000-0001-000000000013', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1013, 'Barak Weiss',    'barak@test.com',  '052-4444444', 'active',   now()-interval '20 days', now()-interval '20 days'),
  ('00000000-0000-0000-0001-000000000014', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1014, 'Michal Har-Paz', 'michal@test.com', '052-5555555', 'active',   now()-interval '15 days', now()-interval '15 days'),
  ('00000000-0000-0000-0001-000000000015', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1015, 'Amit Dayan',     'amit@test.com',   '052-6666666', 'active',   now()-interval '10 days', now()-interval '10 days'),
  ('00000000-0000-0000-0001-000000000016', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1016, 'Nir Ben-Ami',    'nir@test.com',    '052-7777777', 'active',   now()-interval '7 days',  now()-interval '7 days'),
  ('00000000-0000-0000-0001-000000000017', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1017, 'Orly Shapira',   'orly@test.com',   '052-8888888', 'active',   now()-interval '5 days',  now()-interval '5 days'),
  ('00000000-0000-0000-0001-000000000018', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1018, 'Yael Aviram',    'yael@test.com',   '052-9999999', 'inactive', now()-interval '85 days', now()-interval '85 days'),
  ('00000000-0000-0000-0001-000000000019', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1019, 'Doron Nachum',   'doron@test.com',  '054-1111111', 'inactive', now()-interval '78 days', now()-interval '78 days'),
  ('00000000-0000-0000-0001-000000000020', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', 1020, 'Keren Blum',     'keren@test.com',  '054-2222222', 'active',   now()-interval '3 days',  now()-interval '3 days')
on conflict (box_id, arbox_member_id) do nothing;

-- ─── Memberships ─────────────────────────────────────────────
insert into memberships (box_id, member_id, arbox_membership_id, plan_type, price, start_date, end_date, status, created_at)
values
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000001', 2001, 'Monthly Unlimited', 650, now()-interval '80 days', now()+interval '10 days',  'active',   now()-interval '80 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000002', 2002, 'Monthly Unlimited', 650, now()-interval '75 days', now()+interval '15 days',  'active',   now()-interval '75 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000003', 2003, 'Annual Plan',       600, now()-interval '70 days', now()+interval '295 days', 'active',   now()-interval '70 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000004', 2004, 'Monthly Unlimited', 650, now()-interval '65 days', now()+interval '25 days',  'active',   now()-interval '65 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000005', 2005, '3x Per Week',       500, now()-interval '60 days', now()+interval '30 days',  'active',   now()-interval '60 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000006', 2006, 'Monthly Unlimited', 650, now()-interval '55 days', now()+interval '5 days',   'active',   now()-interval '55 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000007', 2007, 'Annual Plan',       600, now()-interval '50 days', now()+interval '315 days', 'active',   now()-interval '50 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000008', 2008, '3x Per Week',       500, now()-interval '45 days', now()+interval '45 days',  'active',   now()-interval '45 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000009', 2009, 'Monthly Unlimited', 650, now()-interval '40 days', now()+interval '50 days',  'active',   now()-interval '40 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000010', 2010, 'Monthly Unlimited', 650, now()-interval '35 days', now()+interval '55 days',  'active',   now()-interval '35 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000011', 2011, '3x Per Week',       500, now()-interval '30 days', now()+interval '60 days',  'active',   now()-interval '30 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000012', 2012, 'Monthly Unlimited', 650, now()-interval '25 days', now()+interval '65 days',  'active',   now()-interval '25 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000013', 2013, 'Annual Plan',       600, now()-interval '20 days', now()+interval '345 days', 'active',   now()-interval '20 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000014', 2014, 'Monthly Unlimited', 650, now()-interval '15 days', now()+interval '15 days',  'active',   now()-interval '15 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000015', 2015, '3x Per Week',       500, now()-interval '10 days', now()+interval '80 days',  'active',   now()-interval '10 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000016', 2016, 'Monthly Unlimited', 650, now()-interval '7 days',  now()+interval '23 days',  'active',   now()-interval '7 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000017', 2017, 'Monthly Unlimited', 650, now()-interval '5 days',  now()+interval '25 days',  'active',   now()-interval '5 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000018', 2018, 'Monthly Unlimited', 650, now()-interval '85 days', now()-interval '25 days',  'expired',  now()-interval '85 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000019', 2019, '3x Per Week',       500, now()-interval '78 days', now()-interval '18 days',  'expired',  now()-interval '78 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000020', 2020, 'Monthly Unlimited', 650, now()-interval '3 days',  now()+interval '27 days',  'active',   now()-interval '3 days')
on conflict (box_id, arbox_membership_id) do nothing;

-- ─── Payments ────────────────────────────────────────────────
insert into payments (box_id, member_id, arbox_payment_id, amount, status, payment_date, created_at)
values
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000001', 3001, 650, 'paid',    (now()-interval '80 days')::date, now()-interval '80 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000002', 3002, 650, 'paid',    (now()-interval '75 days')::date, now()-interval '75 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000003', 3003, 600, 'paid',    (now()-interval '70 days')::date, now()-interval '70 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000004', 3004, 650, 'paid',    (now()-interval '65 days')::date, now()-interval '65 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000005', 3005, 500, 'paid',    (now()-interval '60 days')::date, now()-interval '60 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000006', 3006, 650, 'paid',    (now()-interval '55 days')::date, now()-interval '55 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000007', 3007, 600, 'paid',    (now()-interval '50 days')::date, now()-interval '50 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000008', 3008, 500, 'paid',    (now()-interval '45 days')::date, now()-interval '45 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000001', 3009, 650, 'paid',    (now()-interval '50 days')::date, now()-interval '50 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000002', 3010, 650, 'paid',    (now()-interval '45 days')::date, now()-interval '45 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000009', 3011, 650, 'paid',    (now()-interval '40 days')::date, now()-interval '40 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000010', 3012, 650, 'paid',    (now()-interval '35 days')::date, now()-interval '35 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000011', 3013, 500, 'paid',    (now()-interval '30 days')::date, now()-interval '30 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000018', 3014, 650, 'overdue', (now()-interval '55 days')::date, now()-interval '55 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000019', 3015, 500, 'overdue', (now()-interval '48 days')::date, now()-interval '48 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000001', 3016, 650, 'paid',    (now()-interval '20 days')::date, now()-interval '20 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000002', 3017, 650, 'paid',    (now()-interval '15 days')::date, now()-interval '15 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000003', 3018, 600, 'paid',    (now()-interval '10 days')::date, now()-interval '10 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000004', 3019, 650, 'pending', now()::date,                      now()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000005', 3020, 500, 'pending', now()::date,                      now()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000006', 3021, 650, 'overdue', (now()-interval '5 days')::date,  now()-interval '5 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000012', 3022, 650, 'paid',    (now()-interval '25 days')::date, now()-interval '25 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000013', 3023, 600, 'paid',    (now()-interval '20 days')::date, now()-interval '20 days'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000014', 3024, 650, 'pending', now()::date,                      now()),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '00000000-0000-0000-0001-000000000015', 3025, 500, 'paid',    (now()-interval '8 days')::date,  now()-interval '8 days')
on conflict (box_id, arbox_payment_id) do nothing;

-- ─── Classes (last 30 days, Sun–Fri pattern) ─────────────────
insert into classes (box_id, arbox_class_id, name, coach, scheduled_at, max_capacity, created_at)
select
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  4000 + row_number() over (),
  class_name,
  coach,
  scheduled_at,
  20,
  scheduled_at
from (
  select
    d::date,
    unnest(array['WOD 06:00','WOD 07:00','WOD 12:00','WOD 18:00','WOD 19:00']) as class_name,
    unnest(array['Oren','Oren','Tamar','Oren','Tamar'])                          as coach,
    d + unnest(array[
      interval '6 hours',
      interval '7 hours',
      interval '12 hours',
      interval '18 hours',
      interval '19 hours'
    ]) as scheduled_at
  from generate_series(
    now()::date - interval '30 days',
    now()::date,
    interval '1 day'
  ) as d
  where extract(dow from d) between 0 and 5
) t
on conflict (box_id, arbox_class_id) do nothing;

-- ─── Attendance ──────────────────────────────────────────────
insert into attendance (box_id, member_id, class_id, checked_in, attended_at, created_at)
select
  c.box_id,
  m.id,
  c.id,
  true,
  c.scheduled_at,
  c.scheduled_at
from classes c
cross join members m
where
  m.box_id = c.box_id
  and m.status = 'active'
  and abs(hashtext(m.id::text || c.id::text)) % 10 < 6
  and not (
    m.id in (
      '00000000-0000-0000-0001-000000000018',
      '00000000-0000-0000-0001-000000000019'
    )
    and c.scheduled_at > now() - interval '20 days'
  )
on conflict (box_id, member_id, class_id) do nothing;

-- ─── Result ──────────────────────────────────────────────────
select
  '✅ Seed complete!' as status,
  access_token       as test_token,
  'http://localhost:5173/dashboard/' || access_token as dashboard_url
from boxes
where id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
