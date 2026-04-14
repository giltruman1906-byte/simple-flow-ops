-- ── Cohort Retention Analysis
-- ── For each month cohort (members who joined that month), track what % were
-- ── still active (had at least one check-in) in each subsequent month.
-- ── period_number 0 = the cohort's own join month (baseline)
-- ── Shows last 12 completed cohort months, up to 12 periods forward.

with members as (
    select member_id, box_id, join_date
    from {{ ref('stg_members') }}
    where join_date is not null
),

-- Only include completed cohort months (exclude current partial month)
cohort_months as (
    select
        member_id,
        box_id,
        date_trunc('month', join_date)::date as cohort_month
    from members
    where date_trunc('month', join_date) < date_trunc('month', current_date)
      and join_date >= current_date - interval '13 months'
),

cohort_sizes as (
    select box_id, cohort_month, count(*) as cohort_size
    from cohort_months
    group by box_id, cohort_month
),

-- Distinct months each member had at least one check-in
member_active_months as (
    select distinct
        box_id,
        member_id,
        date_trunc('month', booked_date)::date as active_month
    from {{ ref('stg_bookings') }}
    where checked_in = true
),

-- For each cohort member × active month, compute months since joining (M1+)
retention_raw as (
    select
        c.box_id,
        c.cohort_month,
        (
            extract(year  from age(m.active_month, c.cohort_month)) * 12 +
            extract(month from age(m.active_month, c.cohort_month))
        )::int                                  as period_number,
        count(distinct c.member_id)             as retained_members
    from cohort_months c
    join member_active_months m
      on  m.member_id  = c.member_id
      and m.box_id     = c.box_id
      and m.active_month > c.cohort_month       -- M1 onwards (M0 is synthetic below)
    group by c.box_id, c.cohort_month, period_number
),

-- M0 = 100% by definition: every member is "retained" in their own join month
-- regardless of whether bookings history covers that month
synthetic_m0 as (
    select
        box_id,
        cohort_month,
        cohort_size,
        0                   as period_number,
        cohort_size         as retained_members,
        100.0::numeric      as retention_pct
    from cohort_sizes
)

-- Synthetic M0 rows
select
    s.box_id,
    s.cohort_month,
    s.cohort_size,
    s.period_number,
    s.retained_members,
    s.retention_pct
from synthetic_m0 s

union all

-- Actual M1–M12 from check-in data
select
    r.box_id,
    r.cohort_month,
    cs.cohort_size,
    r.period_number,
    r.retained_members,
    round(r.retained_members::numeric / cs.cohort_size * 100, 1) as retention_pct
from retention_raw r
join cohort_sizes cs
  on  cs.box_id       = r.box_id
  and cs.cohort_month = r.cohort_month
where r.period_number between 1 and 12

order by cohort_month, period_number
