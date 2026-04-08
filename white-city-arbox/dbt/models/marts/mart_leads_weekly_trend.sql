-- ── Weekly conversion trend — one row per (box_id, week_start)
-- ── Last 12 weeks: use to spot if a campaign moved conversion rate

with leads as (
    select * from {{ ref('stg_leads') }}
)

select
    box_id,
    date_trunc('week', created_at)::date                                as week_start,
    count(*)                                                            as total_leads,
    count(*) filter (where status = 'converted')                        as converted,
    round(
        count(*) filter (where status = 'converted')::numeric /
        nullif(count(*), 0) * 100
    , 1)                                                                as conversion_rate_pct
from leads
where created_at >= current_date - 84
group by box_id, date_trunc('week', created_at)::date
order by box_id, week_start
