select
    id                              as member_id,
    box_id,
    arbox_member_id,
    name,
    email,
    phone,
    status,
    join_date,
    created_at
from {{ source('public', 'members') }}
