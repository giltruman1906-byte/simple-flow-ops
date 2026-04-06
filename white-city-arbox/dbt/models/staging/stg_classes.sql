select
    id                                          as class_id,
    box_id,
    arbox_class_id,
    name                                        as class_name,
    coach,
    scheduled_at,
    scheduled_at::date                          as class_date,
    to_char(scheduled_at, 'HH24:MI')            as class_time,
    extract(dow from scheduled_at)              as day_of_week,
    to_char(scheduled_at, 'Day')                as day_name,
    extract(hour from scheduled_at)             as hour_of_day,
    max_capacity,
    created_at
from {{ source('public', 'classes') }}
