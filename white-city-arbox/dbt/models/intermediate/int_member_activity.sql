-- ── Combines member + membership + payments + attendance
-- ── into one row per member, ready for health score calculation

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

attendance as (
    select
        member_id,
        count(*)                                            as total_checkins_90d,
        max(attended_date)                                  as last_checkin_date,
        current_date - max(attended_date)                   as days_since_last_checkin,
        count(*) filter (
            where attended_date >= current_date - 30
        )                                                   as checkins_last_30d,
        count(*) filter (
            where attended_date >= current_date - 7
        )                                                   as checkins_last_7d
    from {{ ref('stg_attendance') }}
    group by member_id
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

    -- Payments
    coalesce(p.last_payment_date, null)     as last_payment_date,
    coalesce(p.total_paid, 0)               as total_paid,
    coalesce(p.total_overdue, 0)            as total_overdue,
    coalesce(p.has_overdue, 0)              as has_overdue,

    -- Attendance
    coalesce(a.total_checkins_90d, 0)       as total_checkins_90d,
    coalesce(a.last_checkin_date, null)     as last_checkin_date,
    coalesce(a.days_since_last_checkin, 999) as days_since_last_checkin,
    coalesce(a.checkins_last_30d, 0)        as checkins_last_30d,
    coalesce(a.checkins_last_7d, 0)         as checkins_last_7d,

    -- ── Health Score (0–100) ──────────────────────────────
    -- Attendance frequency 40pts: 12+ checkins/month = full score
    least(40, round(coalesce(a.checkins_last_30d, 0) / 12.0 * 40)) +

    -- Payment status 30pts: no overdue = full score
    case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +

    -- Membership validity 20pts: active + >14 days left = full
    case
        when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
        when ms.membership_status = 'active' then 10
        else 0
    end +

    -- Tenure loyalty 10pts: 180+ days = full score
    least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))

    as health_score,

    -- ── Health tier ───────────────────────────────────────
    case
        when (
            least(40, round(coalesce(a.checkins_last_30d, 0) / 12.0 * 40)) +
            case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +
            case
                when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
                when ms.membership_status = 'active' then 10
                else 0
            end +
            least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))
        ) >= 75 then 'healthy'
        when (
            least(40, round(coalesce(a.checkins_last_30d, 0) / 12.0 * 40)) +
            case when coalesce(p.has_overdue, 0) = 0 then 30 else 0 end +
            case
                when ms.membership_status = 'active' and coalesce(ms.days_until_expiry, 0) > 14 then 20
                when ms.membership_status = 'active' then 10
                else 0
            end +
            least(10, round(coalesce(current_date - m.join_date, 0) / 180.0 * 10))
        ) >= 40 then 'at_risk'
        else 'critical'
    end                                     as health_tier

from members m
left join memberships  ms on m.member_id = ms.member_id
left join payments     p  on m.member_id = p.member_id
left join attendance   a  on m.member_id = a.member_id
