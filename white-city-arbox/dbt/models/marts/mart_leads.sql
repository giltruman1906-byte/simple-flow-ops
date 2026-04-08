-- ── Tab 4: Sales Funnel (Leads Pipeline)
-- ── One row per (box_id, record_type) — 4 periods: last_30d, last_60d, last_90d, all_time
-- ── upcoming_trials is always lifetime (not period-filtered)

with leads as (
    select * from {{ ref('stg_leads') }}
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
        box_id,
        record_type,
        count(*)                                                        as total_leads,
        count(*) filter (where status = 'new')                          as new_leads,
        count(*) filter (where status = 'in_progress')                  as in_progress,
        count(*) filter (where status = 'trial_booked')                 as trial_booked,
        count(*) filter (where status = 'converted')                    as converted,
        count(*) filter (where status = 'lost')                         as lost,
        round(
            count(*) filter (where status = 'converted')::numeric /
            nullif(count(*) filter (where status != 'new'), 0) * 100
        , 1)                                                            as conversion_rate_pct,
        round(avg(days_in_pipeline) filter (where status = 'converted'), 0)
                                                                        as avg_days_to_convert,

        -- Time-to-convert buckets (converted leads only)
        jsonb_build_object(
            'same_day', count(*) filter (where status = 'converted' and days_in_pipeline = 0),
            '1_3d',     count(*) filter (where status = 'converted' and days_in_pipeline between 1 and 3),
            '4_7d',     count(*) filter (where status = 'converted' and days_in_pipeline between 4 and 7),
            '8_30d',    count(*) filter (where status = 'converted' and days_in_pipeline between 8 and 30),
            '30plus',   count(*) filter (where status = 'converted' and days_in_pipeline > 30)
        )                                                               as convert_time_buckets
    from period_leads
    group by box_id, record_type
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

    -- Lost reasons as JSON array
    (
        select json_agg(jsonb_build_object('reason', lr.lost_reason, 'count', lr.reason_count))
        from lost_reason_counts lr
        where lr.box_id = m.box_id and lr.record_type = m.record_type
    ) as lost_reasons,

    -- Source breakdown as JSON array
    (
        select json_agg(jsonb_build_object('source', sc.source, 'total', sc.total, 'converted', sc.converted))
        from source_counts sc
        where sc.box_id = m.box_id and sc.record_type = m.record_type
    ) as source_breakdown,

    -- Time-to-convert buckets
    m.convert_time_buckets,

    -- Lifetime upcoming trials (same for all periods)
    lt.upcoming_trials

from main m
left join lifetime_trials lt on lt.box_id = m.box_id
