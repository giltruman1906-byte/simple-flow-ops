-- ── Tab 4: Sales Funnel (Leads Pipeline)

with leads as (
    select * from {{ ref('stg_leads') }}
)

select
    box_id,

    -- Funnel counts
    count(*)                                                        as total_leads,
    count(*) filter (where status = 'new')                          as new_leads,
    count(*) filter (where status = 'in_progress')                  as in_progress,
    count(*) filter (where status = 'trial_booked')                 as trial_booked,
    count(*) filter (where status = 'converted')                    as converted,
    count(*) filter (where status = 'lost')                         as lost,

    -- Conversion rate
    round(
        count(*) filter (where status = 'converted')::numeric /
        nullif(count(*) filter (where status != 'new'), 0) * 100
    , 1)                                                            as conversion_rate_pct,

    -- Avg days to convert
    round(avg(days_in_pipeline) filter (where status = 'converted'), 0)
                                                                    as avg_days_to_convert,

    -- Lost reasons breakdown
    json_agg(
        distinct jsonb_build_object(
            'reason', lost_reason,
            'count',  (
                select count(*)
                from leads l2
                where l2.lost_reason = leads.lost_reason
                and l2.box_id = leads.box_id
            )
        )
    ) filter (where lost_reason is not null)                        as lost_reasons,

    -- Source breakdown
    json_agg(
        distinct jsonb_build_object(
            'source',     source,
            'total',      (select count(*) from leads l2 where l2.source = leads.source and l2.box_id = leads.box_id),
            'converted',  (select count(*) from leads l2 where l2.source = leads.source and l2.box_id = leads.box_id and l2.status = 'converted')
        )
    )                                                               as source_breakdown,

    -- Upcoming trials (next 7 days)
    json_agg(
        jsonb_build_object(
            'name',         full_name,
            'phone',        phone,
            'trial_date',   trial_date,
            'source',       source
        )
        order by trial_date
    ) filter (
        where status = 'trial_booked'
        and trial_date between current_date and current_date + 7
    )                                                               as upcoming_trials

from leads
group by box_id
