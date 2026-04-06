-- ── Tab 5: Member Health Scores
-- ── One row per member — powers the Health Alerts tab

select
    member_id,
    box_id,
    name,
    email,
    phone,
    member_status,
    tenure_days,
    plan_type,
    monthly_price,
    membership_end_date,
    days_until_expiry,
    membership_status,
    last_payment_date,
    total_paid,
    total_overdue,
    has_overdue,
    total_checkins_90d,
    last_checkin_date,
    days_since_last_checkin,
    checkins_last_30d,
    checkins_last_7d,
    health_score,
    health_tier,

    -- Alert flags (used by dashboard to show badges)
    case when days_since_last_checkin >= 14 then true else false end    as alert_inactive,
    case when has_overdue = 1              then true else false end      as alert_overdue,
    case when days_until_expiry between 0 and 14 then true else false end as alert_expiring

from {{ ref('int_member_activity') }}
order by health_score asc
