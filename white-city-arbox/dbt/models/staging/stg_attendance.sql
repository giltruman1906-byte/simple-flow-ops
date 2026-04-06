select
    a.id                            as attendance_id,
    a.box_id,
    a.member_id,
    a.class_id,
    a.checked_in,
    a.attended_at,
    a.attended_at::date             as attended_date,
    extract(dow from a.attended_at) as day_of_week,
    extract(hour from a.attended_at) as hour_of_day,
    a.created_at
from {{ source('public', 'attendance') }} a
