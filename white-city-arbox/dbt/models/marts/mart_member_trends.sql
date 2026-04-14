-- ── Member growth trends: weekly (12 weeks) and monthly (12 months)
-- ── cumulative_active = distinct members who checked in during that period
-- ──   (usage-based, not subscription-status-based)
-- ── new_members = members whose join_date falls in that period

with members as (
    select * from {{ ref('stg_members') }}
),

boxes as (
    select distinct box_id from members
),

-- ── Weekly spine ─────────────────────────────────────────────────────────────
weekly_periods as (
    select
        (date_trunc('week', current_date) - (n * interval '1 week'))::date as period_start
    from generate_series(0, 11) as gs(n)
),

weekly_spine as (
    select b.box_id, w.period_start
    from boxes b cross join weekly_periods w
),

-- Distinct members who checked in each week (actual usage)
active_weekly as (
    select
        b.box_id,
        date_trunc('week', b.booked_date)::date as period_start,
        count(distinct b.member_id)              as cumulative_active
    from {{ ref('stg_bookings') }} b
    where b.checked_in    = true
      and b.member_id     is not null
      and b.booked_date   >= current_date - interval '84 days'
    group by b.box_id, date_trunc('week', b.booked_date)::date
),

new_per_week as (
    select
        box_id,
        date_trunc('week', join_date)::date as period_start,
        count(*) as new_members
    from members
    where join_date is not null
    group by box_id, date_trunc('week', join_date)::date
),

-- ── Monthly spine ─────────────────────────────────────────────────────────────
monthly_periods as (
    select
        (date_trunc('month', current_date) - (n * interval '1 month'))::date as period_start
    from generate_series(0, 11) as gs(n)
),

monthly_spine as (
    select b.box_id, m.period_start
    from boxes b cross join monthly_periods m
),

-- Distinct members who checked in each month (actual usage)
active_monthly as (
    select
        b.box_id,
        date_trunc('month', b.booked_date)::date as period_start,
        count(distinct b.member_id)               as cumulative_active
    from {{ ref('stg_bookings') }} b
    where b.checked_in    = true
      and b.member_id     is not null
      and b.booked_date   >= current_date - interval '365 days'
    group by b.box_id, date_trunc('month', b.booked_date)::date
),

new_per_month as (
    select
        box_id,
        date_trunc('month', join_date)::date as period_start,
        count(*) as new_members
    from members
    where join_date is not null
    group by box_id, date_trunc('month', join_date)::date
)

-- ── Weekly rows ───────────────────────────────────────────────────────────────
select
    s.box_id,
    'weekly'::text               as period_type,
    s.period_start,
    coalesce(n.new_members,  0)  as new_members,
    coalesce(a.cumulative_active, 0) as cumulative_active
from weekly_spine s
left join new_per_week  n on n.box_id = s.box_id and n.period_start = s.period_start
left join active_weekly a on a.box_id = s.box_id and a.period_start = s.period_start

union all

-- ── Monthly rows ──────────────────────────────────────────────────────────────
select
    s.box_id,
    'monthly'::text              as period_type,
    s.period_start,
    coalesce(n.new_members,  0)  as new_members,
    coalesce(a.cumulative_active, 0) as cumulative_active
from monthly_spine s
left join new_per_month  n on n.box_id = s.box_id and n.period_start = s.period_start
left join active_monthly a on a.box_id = s.box_id and a.period_start = s.period_start

order by box_id, period_type, period_start
