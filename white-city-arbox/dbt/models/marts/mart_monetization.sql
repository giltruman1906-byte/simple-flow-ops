-- ── Tab 1: Monetization
-- ── MRR, collected, overdue, revenue by plan, weekly trend

with payments as (
    select * from {{ ref('stg_payments') }}
),

memberships as (
    select * from {{ ref('stg_memberships') }}
),

freezes as (
    select * from {{ ref('stg_freezes') }}
),

-- MRR = sum of active membership prices
mrr as (
    select
        box_id,
        sum(price)              as mrr
    from memberships
    where status = 'active'
    group by box_id
),

-- This month totals
current_month as (
    select
        box_id,
        sum(case when status = 'paid'    then amount else 0 end) as collected_this_month,
        sum(case when status = 'pending' then amount else 0 end) as pending_this_month,
        sum(case when status = 'overdue' then amount else 0 end) as overdue_total,
        count(distinct case when status = 'overdue' then member_id end) as overdue_members_count,
        -- Collection rate = paid / (paid + pending + overdue) this month
        round(
            sum(case when status = 'paid' then amount else 0 end) /
            nullif(sum(amount), 0) * 100
        , 1) as collection_rate_pct
    from payments
    where payment_month = date_trunc('month', current_date)
    group by box_id
),

-- Average monthly revenue from complete months only (exclude current partial month)
avg_monthly as (
    select
        box_id,
        round(avg(monthly_total), 0) as avg_monthly_revenue
    from (
        select
            box_id,
            payment_month,
            sum(case when status = 'paid' then amount else 0 end) as monthly_total
        from payments
        where payment_month < date_trunc('month', current_date)
        group by box_id, payment_month
    ) t
    group by box_id
),

-- Last complete month revenue (e.g. March when today is April)
last_month as (
    select
        box_id,
        sum(case when status = 'paid' then amount else 0 end) as collected
    from payments
    where payment_month = date_trunc('month', current_date) - interval '1 month'
    group by box_id
),

-- Month before last (e.g. February)
prev_month as (
    select
        box_id,
        sum(case when status = 'paid' then amount else 0 end) as collected
    from payments
    where payment_month = date_trunc('month', current_date) - interval '2 months'
    group by box_id
),

-- New member MRR: active memberships that started in last complete month
new_member_mrr as (
    select
        box_id,
        count(*)    as new_member_count,
        sum(price)  as new_mrr
    from memberships
    where date_trunc('month', start_date) = date_trunc('month', current_date) - interval '1 month'
      and status = 'active'
    group by box_id
),

-- Revenue by plan type
by_plan as (
    select
        box_id,
        plan_type,
        count(*)                as member_count,
        sum(price)              as plan_revenue
    from memberships
    where status = 'active'
    group by box_id, plan_type
),

-- Weekly revenue last 12 weeks
weekly as (
    select
        box_id,
        date_trunc('week', payment_date)::date    as period_start,
        sum(case when status = 'paid' then amount else 0 end) as period_revenue
    from payments
    where payment_date >= current_date - interval '84 days'
    group by box_id, date_trunc('week', payment_date)::date
),

-- Monthly revenue last 12 months
monthly as (
    select
        box_id,
        date_trunc('month', payment_date)::date   as period_start,
        sum(case when status = 'paid' then amount else 0 end) as period_revenue
    from payments
    where payment_date >= current_date - interval '365 days'
    group by box_id, date_trunc('month', payment_date)::date
),

-- Top 10 overdue members
overdue_members as (
    select
        p.box_id,
        p.member_id,
        m.name,
        m.email,
        m.phone,
        sum(p.amount)           as overdue_amount,
        min(p.payment_date)     as overdue_since
    from payments p
    join {{ ref('stg_members') }} m on p.member_id = m.member_id
    where p.status = 'overdue'
    group by p.box_id, p.member_id, m.name, m.email, m.phone
),

-- Freeze summary: currently active holds
freeze_summary as (
    select
        box_id,
        count(*)                            as frozen_count,
        sum(price)                          as frozen_revenue_impact,
        round(avg(total_days), 0)           as avg_freeze_days
    from freezes
    where is_active = true
    group by box_id
),

-- Freeze reason breakdown (all-time, not just active)
freeze_by_reason as (
    select
        box_id,
        coalesce(reason, 'Other')           as reason,
        count(*)                            as freeze_count,
        round(avg(total_days), 0)           as avg_days
    from freezes
    group by box_id, coalesce(reason, 'Other')
),

-- Monthly freeze trend — how many new freezes started per month (last 12 months)
freeze_monthly as (
    select
        box_id,
        date_trunc('month', freeze_start)::date as period_start,
        count(*)                                as freeze_count,
        sum(total_days)                         as total_days_frozen
    from freezes
    where freeze_start >= current_date - interval '365 days'
    group by box_id, date_trunc('month', freeze_start)::date
),

-- Weekly freeze count (last 12 weeks, by when freeze started)
freeze_weekly as (
    select
        box_id,
        date_trunc('week', freeze_start)::date  as period_start,
        count(*)                                as freeze_count,
        sum(total_days)                         as total_days_frozen
    from freezes
    where freeze_start >= current_date - interval '84 days'
    group by box_id, date_trunc('week', freeze_start)::date
),

-- Freeze breakdown by subscription plan type
freeze_by_plan as (
    select
        box_id,
        coalesce(plan_type, 'Unknown')          as plan_type,
        count(*)                                as freeze_count,
        round(avg(total_days), 0)               as avg_days,
        sum(price)                              as frozen_mrr_impact
    from freezes
    group by box_id, coalesce(plan_type, 'Unknown')
),

-- Frozen MRR by month — total subscription value on hold each calendar month
-- (counts a freeze in every month it spans, not just when it started)
frozen_mrr_monthly as (
    select
        f.box_id,
        gs.month_start::date                    as period_start,
        count(*)                                as freeze_count,
        coalesce(sum(f.price), 0)               as period_revenue   -- reuse period_revenue slot
    from freezes f,
    generate_series(
        date_trunc('month', current_date - interval '11 months'),
        date_trunc('month', current_date),
        interval '1 month'
    ) gs(month_start)
    where f.freeze_start < (gs.month_start + interval '1 month')
      and f.freeze_end   >= gs.month_start
    group by f.box_id, gs.month_start
)

select
    'summary'                   as record_type,
    mrr.box_id,
    mrr.mrr,
    coalesce(cm.collected_this_month, 0)    as collected_this_month,
    coalesce(cm.pending_this_month, 0)      as pending_this_month,
    coalesce(cm.overdue_total, 0)           as overdue_total,
    coalesce(cm.overdue_members_count, 0)   as overdue_members_count,
    coalesce(cm.collection_rate_pct, 0)     as collection_rate_pct,
    coalesce(am.avg_monthly_revenue, 0)     as avg_monthly_revenue,
    -- freeze summary fields
    coalesce(fs.frozen_count, 0)            as frozen_count,
    coalesce(fs.frozen_revenue_impact, 0)   as frozen_revenue_impact,
    coalesce(fs.avg_freeze_days, 0)         as avg_freeze_days,
    coalesce(lm.collected, 0)               as last_month_collected,
    coalesce(pm.collected, 0)               as prev_month_collected,
    coalesce(nm.new_member_count, 0)        as new_member_count,
    coalesce(nm.new_mrr, 0)                 as new_member_mrr,
    null::text                  as plan_type,
    null::bigint                as plan_member_count,
    null::numeric               as plan_revenue,
    null::date                  as period_start,
    null::numeric               as period_revenue,
    null::bigint                as freeze_count,
    null::integer               as total_days_frozen,
    null::text                  as reason,
    null::uuid                  as member_id,
    null::text                  as member_name,
    null::text                  as member_email,
    null::text                  as member_phone,
    null::numeric               as overdue_amount,
    null::date                  as overdue_since
from mrr
left join current_month cm   on mrr.box_id = cm.box_id
left join avg_monthly am     on mrr.box_id = am.box_id
left join freeze_summary fs  on mrr.box_id = fs.box_id
left join last_month lm      on mrr.box_id = lm.box_id
left join prev_month pm      on mrr.box_id = pm.box_id
left join new_member_mrr nm  on mrr.box_id = nm.box_id

-- Column order (30 total):
--  1 record_type, 2 box_id, 3 mrr, 4 collected_this_month, 5 pending_this_month,
--  6 overdue_total, 7 overdue_members_count, 8 collection_rate_pct, 9 avg_monthly_revenue,
-- 10 frozen_count, 11 frozen_revenue_impact, 12 avg_freeze_days,
-- 13 last_month_collected, 14 prev_month_collected, 15 new_member_count, 16 new_member_mrr,
-- 17 plan_type, 18 plan_member_count, 19 plan_revenue,
-- 20 period_start, 21 period_revenue, 22 freeze_count, 23 total_days_frozen, 24 reason,
-- 25 member_id, 26 member_name, 27 member_email, 28 member_phone,
-- 29 overdue_amount, 30 overdue_since

-- All UNION ALL branches: 30 columns
-- 3-9: mrr,collected_this_month,pending_this_month,overdue_total,overdue_members_count,collection_rate_pct,avg_monthly_revenue
-- 10-12: frozen_count,frozen_revenue_impact,avg_freeze_days
-- 13-16: last_month_collected,prev_month_collected,new_member_count,new_member_mrr
-- 17-19: plan_type,plan_member_count,plan_revenue
-- 20-21: period_start,period_revenue
-- 22-24: freeze_count,total_days_frozen,reason
-- 25-30: member_id,member_name,member_email,member_phone,overdue_amount,overdue_since

union all

select
    'by_plan',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    plan_type,                                 -- 17
    member_count,                              -- 18
    plan_revenue,                              -- 19
    null, null,                                -- 20-21 period_*
    null, null, null,                          -- 22-24
    null, null, null, null, null, null         -- 25-30
from by_plan

union all

select
    'weekly_revenue',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    period_start,                              -- 20
    period_revenue,                            -- 21
    null, null, null,                          -- 22-24
    null, null, null, null, null, null         -- 25-30
from weekly

union all

select
    'monthly_revenue',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    period_start,                              -- 20
    period_revenue,                            -- 21
    null, null, null,                          -- 22-24
    null, null, null, null, null, null         -- 25-30
from monthly

union all

select
    'freeze_by_reason',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null,                                -- 10-11 frozen_count, frozen_revenue_impact
    avg_days,                                  -- 12 avg_freeze_days
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    null, null,                                -- 20-21 period_*
    freeze_count,                              -- 22
    null,                                      -- 23 total_days_frozen
    reason,                                    -- 24
    null, null, null, null, null, null         -- 25-30
from freeze_by_reason

union all

select
    'freeze_monthly',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    period_start,                              -- 20
    null,                                      -- 21 period_revenue
    freeze_count,                              -- 22
    total_days_frozen,                         -- 23
    null,                                      -- 24 reason
    null, null, null, null, null, null         -- 25-30
from freeze_monthly

union all

select
    'overdue_members',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    null, null,                                -- 20-21 period_*
    null, null, null,                          -- 22-24
    member_id,                                 -- 25
    name,                                      -- 26
    email,                                     -- 27
    phone,                                     -- 28
    overdue_amount,                            -- 29
    overdue_since                              -- 30
from overdue_members

union all

select
    'freeze_weekly',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    period_start,                              -- 20
    null,                                      -- 21 period_revenue
    freeze_count,                              -- 22
    total_days_frozen,                         -- 23
    null,                                      -- 24 reason
    null, null, null, null, null, null         -- 25-30
from freeze_weekly

union all

select
    'freeze_by_plan',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null,                                -- 10-11 frozen_count, frozen_revenue_impact
    avg_days,                                  -- 12 avg_freeze_days (reused)
    null, null, null, null,                    -- 13-16 last/prev/new_*
    plan_type,                                 -- 17
    null,                                      -- 18 plan_member_count
    frozen_mrr_impact,                         -- 19 plan_revenue (reused)
    null, null,                                -- 20-21 period_*
    freeze_count,                              -- 22
    null, null,                                -- 23-24
    null, null, null, null, null, null         -- 25-30
from freeze_by_plan

union all

select
    'frozen_mrr_monthly',
    box_id,
    null, null, null, null, null, null, null, -- 3-9
    null, null, null,                          -- 10-12 frozen_*
    null, null, null, null,                    -- 13-16 last/prev/new_*
    null, null, null,                          -- 17-19 plan_*
    period_start,                              -- 20
    period_revenue,                            -- 21 = frozen_mrr for this month
    freeze_count,                              -- 22 = members frozen this month
    null, null,                                -- 23-24
    null, null, null, null, null, null         -- 25-30
from frozen_mrr_monthly
