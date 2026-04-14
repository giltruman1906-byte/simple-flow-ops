-- ── Combines member + membership + payments + bookings into one row per member
-- ── Health score: 4 factors (100pts total)
-- ──   Utilization 40pts — checkins vs plan capacity (not a flat benchmark)
-- ──   Payment     30pts — no overdue debt
-- ──   Validity    20pts — membership active + days remaining
-- ──   Tenure      10pts — loyalty / longevity
-- ──
-- ── Plan capacity is extracted from plan_type (Hebrew regex):
-- ──   "X כניסות חודשיות / בחודש" → X/month
-- ──   "X כניסות בשבוע"            → X×4/month
-- ──   "ללא הגבלה" (unlimited)     → 28/month (7×/week, 1 per day)

with members as (
    select * from {{ ref('stg_members') }}
),

memberships as (
    select distinct on (member_id)
        member_id,
        plan_type,
        price,
        end_date,
        days_until_expiry,
        status                  as membership_status
    from {{ ref('stg_memberships') }}
    order by member_id, end_date desc
),

payments as (
    select
        member_id,
        max(payment_date)       as last_payment_date,
        count(*)                as total_payments,
        sum(case when status = 'paid'    then amount else 0 end) as total_paid,
        sum(case when status = 'overdue' then amount else 0 end) as total_overdue,
        max(case when status = 'overdue' then 1 else 0 end)      as has_overdue
    from {{ ref('stg_payments') }}
    group by member_id
),

-- Real check-in counts from bookingsReport
checkins as (
    select
        member_id,
        count(*) filter (where checked_in and booked_date >= current_date - 7)   as checkins_last_7d,
        count(*) filter (where checked_in and booked_date >= current_date - 30)  as checkins_last_30d,
        count(*) filter (where checked_in and booked_date >= current_date - 90)  as checkins_last_90d,
        count(*) filter (where checked_in)                                        as checkins_ytd,
        max(booked_date) filter (where checked_in)                                as last_checkin_date
    from {{ ref('stg_bookings') }}
    where member_id is not null
    group by member_id
),

-- Currently active freezes
frozen_now as (
    select distinct member_id
    from {{ ref('stg_freezes') }}
    where is_active = true
      and member_id is not null
),

-- Extract monthly visit capacity from plan_type name
-- Unlimited = 28 (7 days/week × 4 weeks)
-- Weekly plans  = weekly_cap × 4
-- Monthly plans = cap as stated
-- Fallback = 12 (reasonable mid-tier default)
plan_capacity as (
    select
        member_id,
        case
            when plan_type ~* 'ללא הגבלה|unlimited'
                then 28
            when plan_type ~ '\d+ כניסות בשבוע'
                then (regexp_match(plan_type, '(\d+) כניסות בשבוע'))[1]::int * 4
            when plan_type ~ '\d+ כניסות (חודשיות|בחודש)'
                then (regexp_match(plan_type, '(\d+) כניסות (חודשיות|בחודש)'))[1]::int
            else 12
        end as monthly_capacity
    from memberships
)

select
    m.member_id,
    m.box_id,
    m.name,
    m.email,
    m.phone,
    m.status                                as member_status,
    m.join_date,
    current_date - m.join_date              as tenure_days,

    -- Membership
    ms.plan_type,
    ms.price                                as monthly_price,
    ms.end_date                             as membership_end_date,
    ms.days_until_expiry,
    ms.membership_status,
    coalesce(pc.monthly_capacity, 12)       as plan_monthly_capacity,

    -- Payments
    coalesce(p.last_payment_date, null)     as last_payment_date,
    coalesce(p.total_paid, 0)               as total_paid,
    coalesce(p.total_overdue, 0)            as total_overdue,
    coalesce(p.has_overdue, 0)              as has_overdue,

    -- Attendance (from bookingsReport)
    coalesce(c.checkins_last_7d, 0)         as checkins_last_7d,
    coalesce(c.checkins_last_30d, 0)        as checkins_last_30d,
    coalesce(c.checkins_last_90d, 0)        as total_checkins_90d,
    coalesce(c.checkins_ytd, 0)             as checkins_ytd,
    c.last_checkin_date,
    (current_date - c.last_checkin_date)    as days_since_last_checkin,

    -- Utilization % relative to plan capacity
    least(100, round(
        coalesce(c.checkins_last_30d, 0)::numeric
        / nullif(coalesce(pc.monthly_capacity, 12), 0) * 100
    ))                                      as utilization_pct,

    -- Freeze status
    case when fn.member_id is not null then true else false end as is_frozen,

    -- ── Health Score (0–100) ─────────────────────────────────────────────────
    -- Utilization 40pts: actual / plan_capacity, scales linearly, capped at 40
    round(least(40,
        coalesce(c.checkins_last_30d, 0)::numeric
        / nullif(coalesce(pc.monthly_capacity, 12), 0) * 40
    )) +

    -- Payment 30pts: no overdue = 30, any overdue = 0
    case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +

    -- Validity 20pts: active + >14d remaining = 20, active expiring = 8, else 0
    case
        when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
        when ms.membership_status = 'active' then 8
        else 0
    end +

    -- Tenure 10pts: 180+ days = full, scales linearly
    least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))

    as health_score,

    -- ── Health tier ──────────────────────────────────────────────────────────
    -- Recompute with same formula (avoids SQL subquery nesting)
    case
        when (
            round(least(40,
                coalesce(c.checkins_last_30d, 0)::numeric
                / nullif(coalesce(pc.monthly_capacity, 12), 0) * 40
            )) +
            case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +
            case
                when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
                when ms.membership_status = 'active' then 8
                else 0
            end +
            least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))
        ) >= 70 then 'healthy'
        when (
            round(least(40,
                coalesce(c.checkins_last_30d, 0)::numeric
                / nullif(coalesce(pc.monthly_capacity, 12), 0) * 40
            )) +
            case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +
            case
                when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
                when ms.membership_status = 'active' then 8
                else 0
            end +
            least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))
        ) >= 35 then 'at_risk'
        else 'critical'
    end                                     as health_tier

from members m
left join memberships  ms on m.member_id = ms.member_id
left join plan_capacity pc on m.member_id = pc.member_id
left join payments     p  on m.member_id = p.member_id
left join checkins     c  on m.member_id = c.member_id
left join frozen_now   fn on m.member_id = fn.member_id
