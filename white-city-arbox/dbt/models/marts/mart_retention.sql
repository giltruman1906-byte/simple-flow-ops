-- ── Tab 2: Members & Retention
-- ── Active excludes frozen; retention = active / (active + cancelled)

with activity as (
    select * from {{ ref('int_member_activity') }}
)

select
    box_id,

    -- Active = active members NOT currently frozen
    count(*) filter (
        where member_status = 'active'
        and   not is_frozen
    )                                                                       as total_active,

    -- Frozen (active memberships on hold)
    count(*) filter (
        where member_status = 'active'
        and   is_frozen
    )                                                                       as frozen_count,

    -- New this month (joined in current calendar month, active, not frozen)
    count(*) filter (
        where member_status = 'active'
        and   not is_frozen
        and   join_date >= date_trunc('month', current_date)
        and   join_date is not null
    )                                                                       as new_this_month,

    -- Cancelled memberships (membership_status = 'cancelled')
    count(*) filter (
        where membership_status = 'cancelled'
    )                                                                       as cancelled_count,

    -- Churned in last 90d = became inactive recently
    count(*) filter (
        where member_status = 'inactive'
        and   last_payment_date >= current_date - interval '90 days'
    )                                                                       as churned_90d,

    -- Retention rate = active (non-frozen) / (active + cancelled)
    round(
        count(*) filter (where member_status = 'active' and not is_frozen)::numeric /
        nullif(
            count(*) filter (where member_status = 'active' and not is_frozen) +
            count(*) filter (where membership_status = 'cancelled'),
            0
        ) * 100
    , 1)                                                                    as retention_rate_pct,

    -- Health tiers (active non-frozen members only)
    count(*) filter (
        where health_tier = 'healthy'
        and   member_status = 'active'
        and   not is_frozen
    )                                                                       as healthy_count,

    count(*) filter (
        where health_tier = 'at_risk'
        and   member_status = 'active'
        and   not is_frozen
    )                                                                       as at_risk_count,

    count(*) filter (
        where health_tier = 'critical'
        and   member_status = 'active'
        and   not is_frozen
    )                                                                       as critical_count,

    -- Avg health score (active non-frozen only)
    round(avg(health_score) filter (
        where member_status = 'active' and not is_frozen
    ), 0)                                                                   as avg_health_score

from activity
group by box_id
