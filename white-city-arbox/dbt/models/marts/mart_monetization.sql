-- ── Tab 1: Monetization
-- ── MRR, collected, overdue, revenue by plan, weekly trend

with payments as (
    select * from {{ ref('stg_payments') }}
),

memberships as (
    select * from {{ ref('stg_memberships') }}
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
        count(distinct case when status = 'overdue' then member_id end) as overdue_members_count
    from payments
    where payment_month = date_trunc('month', current_date)
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
        date_trunc('week', payment_date)    as week_start,
        sum(case when status = 'paid' then amount else 0 end) as weekly_revenue
    from payments
    where payment_date >= current_date - interval '84 days'
    group by box_id, date_trunc('week', payment_date)
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
)

select
    'summary'                   as record_type,
    mrr.box_id,
    mrr.mrr,
    coalesce(cm.collected_this_month, 0)    as collected_this_month,
    coalesce(cm.pending_this_month, 0)      as pending_this_month,
    coalesce(cm.overdue_total, 0)           as overdue_total,
    coalesce(cm.overdue_members_count, 0)   as overdue_members_count,
    round(coalesce(cm.collected_this_month, 0) / nullif(mrr.mrr, 0) * 100, 1) as collection_rate_pct,
    null::text                  as plan_type,
    null::bigint                as plan_member_count,
    null::numeric               as plan_revenue,
    null::date                  as week_start,
    null::numeric               as weekly_revenue,
    null::uuid                  as member_id,
    null::text                  as member_name,
    null::text                  as member_email,
    null::text                  as member_phone,
    null::numeric               as overdue_amount,
    null::date                  as overdue_since
from mrr
left join current_month cm on mrr.box_id = cm.box_id

union all

select
    'by_plan',
    box_id,
    null, null, null, null, null, null,
    plan_type,
    member_count,
    plan_revenue,
    null, null, null, null, null, null, null, null
from by_plan

union all

select
    'weekly_revenue',
    box_id,
    null, null, null, null, null, null,
    null, null, null,
    week_start,
    weekly_revenue,
    null, null, null, null, null, null
from weekly

union all

select
    'overdue_members',
    box_id,
    null, null, null, null, null, null,
    null, null, null, null, null,
    member_id,
    name,
    email,
    phone,
    overdue_amount,
    overdue_since
from overdue_members
