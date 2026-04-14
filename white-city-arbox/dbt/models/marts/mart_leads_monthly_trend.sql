-- ── Monthly lead trend — one row per (box_id, month_start)
-- ── Last 12 months: total leads, converted, lost, conversion rate, revenue metrics

with leads as (
    select * from {{ ref('stg_leads') }}
),

avg_mrr as (
    select
        box_id,
        round(avg(price), 0) as avg_mrr
    from {{ source('public', 'memberships') }}
    where status = 'active' and price > 0
    group by box_id
)

select
    l.box_id,
    date_trunc('month', l.created_at)::date                             as month_start,
    count(*)                                                            as total_leads,
    count(*) filter (where l.status = 'converted')                      as converted,
    count(*) filter (where l.status = 'lost')                           as lost,
    count(*) filter (where l.status = 'trial_booked')                   as trial_booked,
    round(
        count(*) filter (where l.status = 'converted')::numeric /
        nullif(count(*), 0) * 100
    , 1)                                                                as conversion_rate_pct,
    -- Won / lost revenue for the month
    (count(*) filter (where l.status = 'converted') * coalesce(am.avg_mrr, 0))  as won_revenue,
    (count(*) filter (where l.status = 'lost')      * coalesce(am.avg_mrr, 0))  as lost_revenue_est

from leads l
left join avg_mrr am on am.box_id = l.box_id
where l.created_at >= current_date - interval '12 months'
group by l.box_id, date_trunc('month', l.created_at)::date, am.avg_mrr
order by l.box_id, month_start
