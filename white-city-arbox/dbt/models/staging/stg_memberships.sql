select
    id                              as membership_id,
    box_id,
    member_id,
    arbox_membership_id,
    plan_type,
    price,
    start_date,
    end_date,
    status,
    (end_date - current_date)       as days_until_expiry,
    created_at
from {{ source('public', 'memberships') }}
