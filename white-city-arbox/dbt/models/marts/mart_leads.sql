-- ── Tab: Sales Funnel (Leads Pipeline)
-- ── One row per (box_id, record_type) — 4 periods: last_30d, last_60d, last_90d, all_time
-- ── Revenue metrics use avg_mrr from active memberships as the value proxy.
--    For converted leads: sum of their matched membership prices (if found via phone),
--    falling back to avg_mrr per converted lead.

with leads as (
    select * from {{ ref('stg_leads') }}
),

-- Avg MRR from active memberships (per box)
avg_mrr as (
    select
        box_id,
        round(avg(price), 0) as avg_mrr
    from {{ source('public', 'memberships') }}
    where status = 'active' and price > 0
    group by box_id
),

-- Expand each lead into 4 period rows
period_leads as (
    select
        l.*,
        p.record_type,
        p.since_date
    from leads l
    cross join (
        values
            ('last_30d'::text, current_date - 30),
            ('last_60d',       current_date - 60),
            ('last_90d',       current_date - 90),
            ('all_time',       '2000-01-01'::date)
    ) as p(record_type, since_date)
    where l.created_at::date >= p.since_date
),

-- Lost reason counts per (box_id, period)
lost_reason_counts as (
    select
        box_id,
        record_type,
        lost_reason,
        count(*) as reason_count
    from period_leads
    where lost_reason is not null
    group by box_id, record_type, lost_reason
),

-- Source breakdown per (box_id, period)
source_counts as (
    select
        box_id,
        record_type,
        source,
        count(*)                                            as total,
        count(*) filter (where status = 'converted')       as converted
    from period_leads
    group by box_id, record_type, source
),

-- Lifetime upcoming trials — not period filtered
lifetime_trials as (
    select
        box_id,
        json_agg(
            jsonb_build_object(
                'name',       full_name,
                'phone',      phone,
                'trial_date', trial_date,
                'source',     source
            )
            order by trial_date
        ) filter (
            where status = 'trial_booked'
            and trial_date between current_date and current_date + 7
        ) as upcoming_trials
    from leads
    group by box_id
),

-- Main funnel aggregation per period
main as (
    select
        pl.box_id,
        pl.record_type,
        count(*)                                                        as total_leads,
        count(*) filter (where pl.status = 'new')                       as new_leads,
        count(*) filter (where pl.status = 'in_progress')               as in_progress,
        count(*) filter (where pl.status = 'trial_booked')              as trial_booked,
        count(*) filter (where pl.status = 'converted')                 as converted,
        count(*) filter (where pl.status = 'lost')                      as lost,
        round(
            count(*) filter (where pl.status = 'converted')::numeric /
            nullif(count(*) filter (where pl.status != 'new'), 0) * 100
        , 1)                                                            as conversion_rate_pct,
        round(avg(pl.days_in_pipeline) filter (where pl.status = 'converted'), 0)
                                                                        as avg_days_to_convert,

        -- Time-to-convert buckets (converted leads only)
        jsonb_build_object(
            'same_day', count(*) filter (where pl.status = 'converted' and pl.days_in_pipeline = 0),
            '1_3d',     count(*) filter (where pl.status = 'converted' and pl.days_in_pipeline between 1 and 3),
            '4_7d',     count(*) filter (where pl.status = 'converted' and pl.days_in_pipeline between 4 and 7),
            '8_30d',    count(*) filter (where pl.status = 'converted' and pl.days_in_pipeline between 8 and 30),
            '30plus',   count(*) filter (where pl.status = 'converted' and pl.days_in_pipeline > 30)
        )                                                               as convert_time_buckets,

        -- Revenue metrics (use avg_mrr as value proxy per lead)
        am.avg_mrr

    from period_leads pl
    left join avg_mrr am on am.box_id = pl.box_id
    group by pl.box_id, pl.record_type, am.avg_mrr
)

select
    m.box_id,
    m.record_type,
    m.total_leads,
    m.new_leads,
    m.in_progress,
    m.trial_booked,
    m.converted,
    m.lost,
    m.conversion_rate_pct,
    m.avg_days_to_convert,
    m.avg_mrr,

    -- Pipeline value: what's currently in trial_booked stage × avg MRR
    (m.trial_booked * coalesce(m.avg_mrr, 0))                           as pipeline_value,

    -- Won revenue: converted leads × avg MRR
    (m.converted * coalesce(m.avg_mrr, 0))                              as won_revenue,

    -- Lost revenue: lost leads × avg MRR
    (m.lost * coalesce(m.avg_mrr, 0))                                   as lost_revenue_est,

    -- Lost reasons as JSON array
    (
        select json_agg(jsonb_build_object('reason', lr.lost_reason, 'count', lr.reason_count)
                        order by lr.reason_count desc)
        from lost_reason_counts lr
        where lr.box_id = m.box_id and lr.record_type = m.record_type
    ) as lost_reasons,

    -- Source breakdown as JSON array
    (
        select json_agg(jsonb_build_object('source', sc.source, 'total', sc.total, 'converted', sc.converted)
                        order by sc.total desc)
        from source_counts sc
        where sc.box_id = m.box_id and sc.record_type = m.record_type
    ) as source_breakdown,

    -- Time-to-convert buckets
    m.convert_time_buckets,

    -- Lifetime upcoming trials (same for all periods)
    lt.upcoming_trials

from main m
left join lifetime_trials lt on lt.box_id = m.box_id
