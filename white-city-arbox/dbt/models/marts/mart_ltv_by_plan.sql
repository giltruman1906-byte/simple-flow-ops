-- ── LTV (Lifetime Value) by Plan Type
-- ── avg_ltv = avg_price × avg_tenure_months for all memberships on that plan
-- ── Uses all memberships (active + expired/cancelled) for a complete picture.
-- ── Excludes ancillary plans (price ≤ 100) like locker rentals.
-- ── Minimum 3 memberships required for statistical relevance.

with memberships as (
    select *
    from {{ ref('stg_memberships') }}
    where (price > 100 or price = 0 or price is null)  -- include paid plans + free/gift (price=0); exclude locker rental (₪65)
      and start_date is not null
),

plan_stats as (
    select
        box_id,
        plan_type,
        count(distinct member_id)                               as member_count,
        round(avg(price), 0)                                    as avg_price,
        round(
            avg(
                extract(epoch from
                    age(coalesce(end_date, current_date), start_date)
                ) / (30.44 * 24 * 3600)
            )
        , 1)                                                    as avg_tenure_months,
        round(
            avg(price) *
            avg(
                extract(epoch from
                    age(coalesce(end_date, current_date), start_date)
                ) / (30.44 * 24 * 3600)
            )
        , 0)                                                    as avg_ltv,
        -- Also useful for context
        count(*) filter (where status = 'active')              as active_count,
        count(*) filter (where status != 'active')             as past_count
    from memberships
    group by box_id, plan_type
    having count(*) >= 1
)

select *
from plan_stats
order by avg_ltv desc
