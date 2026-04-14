-- ── Silver: bookings
-- ── One row per member × class session
-- ── Enriches raw bookings with derived time dimensions

select
    b.id,
    b.box_id,
    b.member_id,
    b.arbox_user_id,
    b.class_name,
    b.space_name,
    b.coach,
    b.booked_date,
    b.booked_time,
    b.checked_in,
    b.is_first_session,
    b.membership_type,
    b.sessions_left,

    -- Time dimensions
    date_trunc('week',  b.booked_date)::date  as booked_week,
    date_trunc('month', b.booked_date)::date  as booked_month,

    -- Day of week: 0 = Sunday … 6 = Saturday (Postgres extract(dow))
    extract(dow from b.booked_date)::int       as day_of_week,

    -- Hour from "07:00" string
    split_part(b.booked_time, ':', 1)::int     as hour_of_day

from {{ source('public', 'bookings') }} b
where b.booked_date is not null
