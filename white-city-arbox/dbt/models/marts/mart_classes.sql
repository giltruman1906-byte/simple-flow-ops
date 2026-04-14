-- ── Gold: Classes & Usage
-- ── Fill rate = check-ins / max_capacity (per session, then averaged)
-- ── Show-up rate = check-ins / registrations
-- ── Record types: summary | by_coach | by_class_type | weekly_trend | heatmap

with bookings as (
    select * from {{ ref('stg_bookings') }}
),

classes as (
    select * from {{ ref('stg_classes') }}
),

-- Join bookings → classes to get max_capacity per booking row
-- 100% match rate confirmed (booked_date + booked_time + class_name is unique per session)
enriched as (
    select
        b.box_id,
        b.member_id,
        b.class_name,
        b.coach,
        b.booked_date,
        b.booked_time,
        b.booked_week,
        b.day_of_week,
        b.hour_of_day,
        b.checked_in,
        b.is_first_session,
        c.max_capacity
    from bookings b
    join classes c
        on  b.booked_date  = c.class_date
        and b.booked_time  = c.class_time
        and b.class_name   = c.class_name
        and b.box_id       = c.box_id
),

-- One row per unique session (class_name + date + time)
sessions as (
    select
        box_id,
        class_name,
        coach,
        booked_date,
        booked_time,
        booked_week,
        day_of_week,
        hour_of_day,
        max_capacity,
        count(*)                                                          as registrations,
        sum(case when checked_in    then 1 else 0 end)                   as checkins,
        sum(case when is_first_session then 1 else 0 end)                as first_timers,
        -- Fill rate: checkins / max_capacity (your formula: 15/20 = 75%)
        round(
            sum(case when checked_in then 1 else 0 end)::numeric
            / nullif(max_capacity, 0) * 100
        , 1)                                                              as fill_rate,
        -- Registration rate: who signed up vs capacity
        round(count(*)::numeric / nullif(max_capacity, 0) * 100, 1)     as registration_rate,
        -- Show-up rate: of those who registered, who came
        round(
            sum(case when checked_in then 1 else 0 end)::numeric
            / nullif(count(*), 0) * 100
        , 1)                                                              as showup_rate
    from enriched
    group by box_id, class_name, coach, booked_date, booked_time,
             booked_week, day_of_week, hour_of_day, max_capacity
),

-- ── Aggregate CTEs ────────────────────────────────────────────────────────────

summary as (
    select
        box_id,
        count(*)                                                          as total_sessions,
        sum(registrations)                                                as total_registrations,
        sum(checkins)                                                     as total_checkins,
        sum(first_timers)                                                 as total_first_timers,
        round(avg(fill_rate), 1)                                          as avg_fill_rate,
        round(avg(registration_rate), 1)                                  as avg_registration_rate,
        round(sum(checkins)::numeric / nullif(sum(registrations),0)*100,1) as avg_showup_rate
    from sessions
    group by box_id
),

by_coach as (
    select
        box_id,
        coach                                                             as label,
        count(*)                                                          as total_sessions,
        sum(registrations)                                                as total_registrations,
        sum(checkins)                                                     as total_checkins,
        null::bigint                                                      as total_first_timers,
        round(avg(fill_rate), 1)                                          as avg_fill_rate,
        round(sum(checkins)::numeric / nullif(sum(registrations),0)*100,1) as avg_showup_rate,
        null::date                                                        as period_start,
        null::int                                                         as day_of_week,
        null::int                                                         as hour_of_day,
        -- Most frequent class for this coach
        mode() within group (order by class_name)                        as top_class
    from sessions
    where coach is not null and coach <> ''
    group by box_id, coach
),

by_class_type as (
    select
        box_id,
        class_name                                                        as label,
        count(*)                                                          as total_sessions,
        sum(registrations)                                                as total_registrations,
        sum(checkins)                                                     as total_checkins,
        null::bigint                                                      as total_first_timers,
        round(avg(fill_rate), 1)                                          as avg_fill_rate,
        round(sum(checkins)::numeric / nullif(sum(registrations),0)*100,1) as avg_showup_rate,
        null::date                                                        as period_start,
        null::int                                                         as day_of_week,
        null::int                                                         as hour_of_day,
        null::text                                                        as top_class
    from sessions
    group by box_id, class_name
),

weekly_trend as (
    select
        box_id,
        null::text                                                        as label,
        count(*)                                                          as total_sessions,
        sum(registrations)                                                as total_registrations,
        sum(checkins)                                                     as total_checkins,
        null::bigint                                                      as total_first_timers,
        round(avg(fill_rate), 1)                                          as avg_fill_rate,
        null::numeric                                                     as avg_showup_rate,
        booked_week                                                       as period_start,
        null::int                                                         as day_of_week,
        null::int                                                         as hour_of_day,
        null::text                                                        as top_class
    from sessions
    group by box_id, booked_week
),

heatmap as (
    select
        box_id,
        null::text                                                        as label,
        count(*)                                                          as total_sessions,
        null::bigint                                                      as total_registrations,
        sum(checkins)                                                     as total_checkins,
        null::bigint                                                      as total_first_timers,
        round(avg(fill_rate), 1)                                          as avg_fill_rate,
        null::numeric                                                     as avg_showup_rate,
        null::date                                                        as period_start,
        day_of_week,
        hour_of_day,
        null::text                                                        as top_class
    from sessions
    group by box_id, day_of_week, hour_of_day
)

-- ── UNION ALL ─────────────────────────────────────────────────────────────────

select 'summary'::text as record_type,
    box_id, null as label,
    total_sessions, total_registrations, total_checkins, total_first_timers,
    avg_fill_rate, avg_showup_rate, null::date as period_start,
    null::int as day_of_week, null::int as hour_of_day, null::text as top_class
from summary

union all

select 'by_coach', box_id, label,
    total_sessions, total_registrations, total_checkins, total_first_timers,
    avg_fill_rate, avg_showup_rate, period_start, day_of_week, hour_of_day, top_class
from by_coach

union all

select 'by_class_type', box_id, label,
    total_sessions, total_registrations, total_checkins, total_first_timers,
    avg_fill_rate, avg_showup_rate, period_start, day_of_week, hour_of_day, top_class
from by_class_type

union all

select 'weekly_trend', box_id, label,
    total_sessions, total_registrations, total_checkins, total_first_timers,
    avg_fill_rate, avg_showup_rate, period_start, day_of_week, hour_of_day, top_class
from weekly_trend

union all

select 'heatmap', box_id, label,
    total_sessions, total_registrations, total_checkins, total_first_timers,
    avg_fill_rate, avg_showup_rate, period_start, day_of_week, hour_of_day, top_class
from heatmap
