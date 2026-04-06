select
    id                              as payment_id,
    box_id,
    member_id,
    arbox_payment_id,
    amount,
    status,
    payment_date,
    date_trunc('month', payment_date)  as payment_month,
    created_at
from {{ source('public', 'payments') }}
