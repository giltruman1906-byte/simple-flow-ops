-- ── Tab 3: Classes & Usage

with classes as (
    select * from {{ ref('stg_classes') }}
),

attendance as (
    select * from {{ ref('stg_attendance') }}
),

-- Attendance count per class
class_attendance as (
    select
        class_id,
        count(*) as attendees
    from attendance
    group by class_id
),

-- Joined
enriched as (
    select
        c.class_id,
        c.box_id,
        c.class_name,
        c.coach,
        c.class_date,
        c.class_time,
        c.day_of_week,
        c.day_name,
        c.hour_of_day,
        c.max_capacity,
        coalesce(ca.attendees, 0)                                   as attendees,
        round(coalesce(ca.attendees, 0)::numeric /
              nullif(c.max_capacity, 0) * 100, 1)                   as fill_rate_pct
    from classes c
    left join class_attendance ca on c.class_id = ca.class_id
)

select
    box_id,

    -- KPIs
    count(distinct class_id)                                        as total_classes,
    round(avg(attendees), 1)                                        as avg_attendance,
    round(avg(fill_rate_pct), 1)                                    as avg_fill_rate_pct,

    -- Busiest day
    mode() within group (order by day_name)                         as busiest_day,

    -- Busiest hour
    mode() within group (order by hour_of_day)                      as busiest_hour,

    -- Most popular class name
    mode() within group (order by class_name)                       as most_popular_class,

    -- Top coach (by attendance driven)
    mode() within group (order by coach)                            as top_coach,

    -- Heatmap data as JSON arrays (day x hour)
    json_agg(
        json_build_object(
            'day',       day_of_week,
            'hour',      hour_of_day,
            'attendees', attendees
        )
        order by day_of_week, hour_of_day
    )                                                               as heatmap_data,

    -- By coach summary
    json_agg(
        distinct jsonb_build_object(
            'coach',            coach,
            'total_attendees',  (
                select sum(e2.attendees)
                from enriched e2
                where e2.coach = enriched.coach
                and e2.box_id = enriched.box_id
            )
        )
    )                                                               as coach_summary

from enriched
group by box_id
