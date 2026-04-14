-- ── stg_freezes: membership holds / suspensions
-- Each row = one freeze event for one member
-- task_status: taskNone (resolved), taskToday (active today), taskFuture (upcoming), taskPast (past)

with source as (
    select * from {{ source('public', 'freezes') }}
)

select
    id                                          as freeze_id,
    box_id,
    member_id,
    arbox_hold_id,
    arbox_membership_id,
    plan_type,
    freeze_start::date                          as freeze_start,
    freeze_end::date                            as freeze_end,
    total_days,
    reason,
    task_status,
    price,
    -- Is this freeze currently active?
    (freeze_start <= current_date and freeze_end >= current_date)
                                                as is_active,
    synced_at
from source
