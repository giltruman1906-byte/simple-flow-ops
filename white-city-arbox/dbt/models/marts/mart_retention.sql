-- ── Tab 2: Members & Retention

with members as (
    select * from {{ ref('stg_members') }}
),

activity as (
    select * from {{ ref('int_member_activity') }}
)

select
    box_id,

    -- KPIs
    count(*) filter (where member_status = 'active')                        as total_active,
    count(*) filter (where member_status = 'inactive')                      as total_inactive,
    count(*) filter (
        where member_status = 'active'
        and join_date >= date_trunc('month', current_date)
    )                                                                       as new_this_month,
    count(*) filter (
        where member_status = 'inactive'
        and join_date >= current_date - interval '90 days'
    )                                                                       as churned_90d,

    -- Retention rate
    round(
        count(*) filter (where member_status = 'active')::numeric /
        nullif(count(*), 0) * 100
    , 1)                                                                    as retention_rate_pct,

    -- Health tiers
    count(*) filter (where health_tier = 'healthy')                         as healthy_count,
    count(*) filter (where health_tier = 'at_risk')                         as at_risk_count,
    count(*) filter (where health_tier = 'critical')                        as critical_count,

    -- Avg metrics
    round(avg(checkins_last_30d), 1)                                        as avg_checkins_per_month,
    round(avg(health_score), 0)                                             as avg_health_score

from activity
group by box_id
