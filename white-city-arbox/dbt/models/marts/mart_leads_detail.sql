-- ── Leads detail — individual rows for drill-down drawer
-- ── No RLS: accessed via anon key like all other mart tables

select
    lead_id,
    box_id,
    full_name,
    first_name,
    last_name,
    phone,
    email,
    source,
    status,
    lost_reason,
    trial_date,
    created_at,
    days_in_pipeline

from {{ ref('stg_leads') }}
order by created_at desc
