-- ── Member growth trends — one row per (box_id, week_start)
-- ── Last 12 weeks: new members + cumulative active count

with members as (
    select * from {{ ref('stg_members') }}
),

-- 12-week spine anchored to Monday
weeks as (
    select
        (date_trunc('week', current_date) - (n * interval '1 week'))::date as week_start
    from generate_series(0, 11) as gs(n)
),

boxes as (
    select distinct box_id from members
),

spine as (
    select b.box_id, w.week_start
    from boxes b cross join weeks w
),

new_per_week as (
    select
        box_id,
        date_trunc('week', join_date)::date as week_start,
        count(*) as new_members
    from members
    group by box_id, date_trunc('week', join_date)::date
),

-- Cumulative active: members who joined on or before end of this week
cumulative_active as (
    select
        s.box_id,
        s.week_start,
        count(*) filter (
            where m.join_date <= s.week_start + 6
            and   m.status = 'active'
        ) as cumulative_active
    from spine s
    join members m on m.box_id = s.box_id
    group by s.box_id, s.week_start
)

select
    s.box_id,
    s.week_start,
    coalesce(n.new_members, 0)  as new_members,
    coalesce(c.cumulative_active, 0) as cumulative_active
from spine s
left join new_per_week    n on n.box_id = s.box_id and n.week_start = s.week_start
left join cumulative_active c on c.box_id = s.box_id and c.week_start = s.week_start
order by s.box_id, s.week_start
