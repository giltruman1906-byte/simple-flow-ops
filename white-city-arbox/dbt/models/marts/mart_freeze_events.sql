-- ── One row per freeze event, enriched with member name and health tier
-- ── Used for the raw freeze events table in the Freezes tab
-- ── No RLS (publicly readable by anon key, scoped by box_id)

select
    f.box_id,
    f.arbox_hold_id,
    f.member_id,
    m.name                          as member_name,
    f.plan_type,
    a.health_tier,
    a.health_score,
    f.freeze_start,
    f.freeze_end,
    f.total_days,
    f.reason,
    f.price,
    f.task_status,
    f.is_active

from {{ ref('stg_freezes') }} f
left join {{ ref('stg_members') }}      m on f.member_id = m.member_id
left join {{ ref('int_member_activity') }} a on f.member_id = a.member_id
