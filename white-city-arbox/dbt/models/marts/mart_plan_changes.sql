-- ── Plan changes: upgrades and downgrades
-- ── One row per membership where the member had a prior membership (price comparison)
-- ── upgrade   = new price > old price
-- ── downgrade = new price < old price
-- ── lateral   = same price, different plan name

with memberships as (
    select * from {{ ref('stg_memberships') }}
),

members as (
    select member_id, name, email, phone
    from {{ ref('stg_members') }}
),

-- For each member, compare current membership price to previous one
ranked as (
    select
        ms.member_id,
        ms.box_id,
        ms.plan_type,
        ms.price,
        ms.start_date,
        ms.status,
        lag(ms.price)     over (partition by ms.member_id order by ms.start_date) as prev_price,
        lag(ms.plan_type) over (partition by ms.member_id order by ms.start_date) as prev_plan
    from memberships ms
),

changes as (
    select
        r.member_id,
        r.box_id,
        r.plan_type                                 as new_plan,
        r.prev_plan,
        r.price                                     as new_price,
        r.prev_price,
        r.price - r.prev_price                      as revenue_delta,
        r.start_date                                as changed_at,
        case
            when r.price > r.prev_price then 'upgrade'
            when r.price < r.prev_price then 'downgrade'
            else 'lateral'
        end                                         as change_type
    from ranked r
    where r.prev_price is not null          -- skip first-ever membership
      and r.price      != r.prev_price      -- skip lateral moves (same price)
      and r.price      >  100              -- exclude ancillary plans (lockers, etc.)
      and r.prev_price >  100
)

select
    c.box_id,
    c.member_id,
    m.name,
    m.email,
    m.phone,
    c.change_type,
    c.prev_plan,
    c.new_plan,
    c.prev_price,
    c.new_price,
    c.revenue_delta,
    c.changed_at,

    -- Summary aggregates (used by the KPI cards in the frontend)
    count(*) filter (where c.change_type = 'upgrade')   over (partition by c.box_id) as total_upgrades,
    count(*) filter (where c.change_type = 'downgrade') over (partition by c.box_id) as total_downgrades,
    sum(c.revenue_delta) filter (where c.change_type = 'upgrade')   over (partition by c.box_id) as upgrade_revenue_gain,
    sum(abs(c.revenue_delta)) filter (where c.change_type = 'downgrade') over (partition by c.box_id) as downgrade_revenue_lost

from changes c
join members m on m.member_id = c.member_id
order by c.changed_at desc
