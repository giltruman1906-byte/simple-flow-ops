-- ── One row per active (non-frozen) member
-- ── Used for drill-down modals and distribution breakdowns in Members tab

select
    a.member_id,
    a.box_id,
    a.name,
    a.email,
    a.join_date,
    date_trunc('week',  a.join_date)::date  as join_week,
    date_trunc('month', a.join_date)::date  as join_month,
    a.plan_type,
    a.monthly_price,
    a.health_tier,
    a.health_score,
    a.membership_status,
    a.has_overdue,
    a.is_frozen

from {{ ref('int_member_activity') }} a
where a.member_status = 'active'
