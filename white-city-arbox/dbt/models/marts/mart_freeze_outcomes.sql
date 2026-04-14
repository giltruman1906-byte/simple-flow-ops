-- ── Freeze → Churn Outcomes
-- ── For each completed freeze event, classify what happened to the member afterward:
-- ──   returned  = had at least one check-in after freeze_end
-- ──   churned   = no post-freeze check-in, member is now inactive, freeze ended 14+ days ago
-- ──   at_risk   = no post-freeze check-in yet, still technically active (may still return)
-- ──   unknown   = freeze ended < 14 days ago — too soon to classify
-- ── Only completed (non-active) freezes are included.

with freezes as (
    select *
    from {{ ref('stg_freezes') }}
    where is_active  = false
      and freeze_end is not null
),

members as (
    select member_id, box_id, status, name
    from {{ ref('stg_members') }}
),

-- All post-freeze check-ins (used in EXISTS check below)
checkins as (
    select box_id, member_id, booked_date
    from {{ ref('stg_bookings') }}
    where checked_in = true
),

freeze_with_return as (
    select
        f.freeze_id,
        f.box_id,
        f.member_id,
        m.name                          as member_name,
        m.status                        as member_status,
        f.plan_type,
        f.price,
        f.freeze_start,
        f.freeze_end,
        f.total_days,
        f.reason,
        (current_date - f.freeze_end)::int as days_since_ended,
        exists (
            select 1 from checkins c
            where c.member_id  = f.member_id
              and c.box_id     = f.box_id
              and c.booked_date > f.freeze_end
        )                               as returned
    from freezes f
    join members m
      on  m.member_id = f.member_id
      and m.box_id    = f.box_id
),

classified as (
    select
        *,
        case
            when returned                                        then 'returned'
            when days_since_ended <= 14                          then 'unknown'
            when member_status = 'inactive'                      then 'churned'
            else                                                      'at_risk'
        end as outcome
    from freeze_with_return
)

select
    c.box_id,
    c.freeze_id,
    c.member_id,
    c.member_name,
    c.member_status,
    c.plan_type,
    c.price,
    c.freeze_start,
    c.freeze_end,
    c.total_days,
    c.reason,
    c.outcome,
    c.returned,
    c.days_since_ended,

    -- Box-level summary (window aggregates for the KPI cards)
    count(*) filter (where c.outcome = 'returned')
        over (partition by c.box_id)                                    as total_returned,
    count(*) filter (where c.outcome = 'churned')
        over (partition by c.box_id)                                    as total_churned,
    count(*) filter (where c.outcome = 'at_risk')
        over (partition by c.box_id)                                    as total_at_risk,
    count(*) filter (where c.outcome in ('returned','churned','at_risk'))
        over (partition by c.box_id)                                    as total_completed,
    round(
        count(*) filter (where c.outcome = 'returned') over (partition by c.box_id)::numeric
        / nullif(
            count(*) filter (where c.outcome in ('returned','churned','at_risk'))
                over (partition by c.box_id), 0
          ) * 100
    , 1)                                                                as return_rate_pct

from classified c
order by c.freeze_end desc
