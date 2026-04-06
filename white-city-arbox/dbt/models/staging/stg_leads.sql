select
    id                                          as lead_id,
    box_id,
    arbox_lead_id,
    first_name,
    last_name,
    first_name || ' ' || last_name              as full_name,
    email,
    phone,
    source,
    status,
    lost_reason,
    trial_date,
    case
        when status = 'converted'     then 4
        when status = 'trial_booked'  then 3
        when status = 'in_progress'   then 2
        when status = 'new'           then 1
        when status = 'lost'          then 0
    end                                         as funnel_stage_order,
    (current_date - created_at::date)           as days_in_pipeline,
    created_at
from {{ source('public', 'leads') }}
