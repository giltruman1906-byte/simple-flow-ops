# CrossFit White City — Data Pipeline MVP
## Claude Code Briefing Prompt

---

## ROLE

You are a senior data engineer. You are building an end-to-end data pipeline MVP
for a CrossFit gym called **CrossFit White City** using their gym management SaaS **Arbox**.

Work phase by phase. Do not skip ahead. After each phase, summarize what was created
and wait for confirmation before proceeding.

---

## PROJECT CONTEXT

The client uses **Arbox** as their gym CRM. We need to extract member and subscription
data from the Arbox REST API, model it using the medallion architecture (bronze / silver / gold),
and serve KPI dashboards locally using Streamlit for MVP approval.

After MVP sign-off, the stack migrates to a live server (Supabase + Metabase + GitHub Actions or Modal).

---

## TWO-PHASE PLAN

### PHASE 1 — Local MVP (build this now)
```
Arbox API
   └── Python extractor (requests)
         └── DuckDB (local .db file)
               └── dbt Core (dbt-duckdb adapter)
                     ├── Bronze  → raw tables
                     ├── Silver  → cleaned dims + facts
                     └── Gold    → KPI aggregates
                           └── Streamlit app (local dashboard)
```

### PHASE 2 — Live (after MVP approval, do not build yet)
```
Arbox API
   └── Modal (scheduled Python function, daily cron)
         └── Supabase PostgreSQL
               └── dbt Core (dbt-postgres adapter)
                     ├── Bronze / Silver / Gold (same models)
                           └── Metabase (public URL dashboard)
```

---

## CRITICAL ENGINEERING RULES

1. **Write all dbt SQL in standard ANSI SQL only** — no DuckDB-specific functions.
   This ensures models run unchanged on Postgres in Phase 2.
2. **Use environment flags** to switch between local and live config.
   Never hardcode credentials or file paths.
3. **Keep dbt models adapter-agnostic** — the only things that change in Phase 2
   are `profiles.yml` and the adapter package.
4. **All secrets go in `.env`** (gitignored). Provide `.env.example` with all keys documented.
5. **One GitHub repo** for everything: ingestion + dbt + streamlit + docs.

---

## ARBOX API

- Base URL: `https://api.arbox.me/` (confirm with client)
- Auth: API key in header (`Authorization: Bearer <ARBOX_API_KEY>`)
- Key endpoints to extract:
  - `/members` — trainee profiles (id, name, email, phone, join_date, status)
  - `/subscriptions` — membership plans (member_id, plan_name, start_date, end_date, price, status)
  - `/attendance` — class check-ins (member_id, class_id, class_date, class_type)
- Handle: pagination (`page`, `per_page` params), rate limiting (retry with backoff x3)
- Extract scope for MVP: **last 3 months of data only**

---

## REPO STRUCTURE TO SCAFFOLD

```
crossfit-whitecity-data/
│
├── ingestion/
│   ├── arbox_extractor.py       # API client — extracts members, subs, attendance
│   ├── loader.py                # Loads extracted JSON into DuckDB bronze schema
│   └── run_pipeline.py          # Entrypoint: extract → load → dbt run
│
├── dbt/
│   ├── dbt_project.yml
│   ├── profiles.yml             # gitignored — use profiles.yml.example
│   ├── profiles.yml.example
│   ├── models/
│   │   ├── bronze/
│   │   │   ├── sources.yml      # declare raw DuckDB tables as sources
│   │   │   └── (no SQL here — bronze = raw load target, not dbt models)
│   │   ├── silver/
│   │   │   ├── schema.yml       # tests + descriptions
│   │   │   ├── dim_members.sql
│   │   │   ├── dim_subscriptions.sql
│   │   │   └── fct_attendance.sql
│   │   └── gold/
│   │       ├── schema.yml
│   │       ├── kpi_active_members.sql
│   │       ├── kpi_revenue_monthly.sql
│   │       ├── kpi_churn.sql
│   │       └── kpi_attendance_weekly.sql
│   └── tests/
│       └── generic/             # custom dbt tests if needed
│
├── streamlit/
│   ├── app.py                   # Main Streamlit dashboard
│   ├── pages/
│   │   ├── 01_members.py        # Membership overview page
│   │   ├── 02_revenue.py        # Revenue & subscriptions page
│   │   └── 03_attendance.py     # Attendance trends page
│   └── utils/
│       └── db.py                # DuckDB connection helper
│
├── .env.example
├── .gitignore
├── requirements.txt
├── Makefile                     # make extract, make dbt, make app, make all
└── README.md
```

---

## PHASE 1 TASKS — BUILD IN THIS ORDER

### TASK 1 — Project scaffold
- Create the full folder structure above
- Create `requirements.txt`:
  ```
  duckdb
  dbt-core
  dbt-duckdb
  requests
  python-dotenv
  streamlit
  pandas
  plotly
  ```
- Create `.env.example`:
  ```
  ARBOX_API_KEY=your_arbox_api_key_here
  ARBOX_BASE_URL=https://api.arbox.me
  DUCKDB_PATH=./data/whitecity.duckdb
  EXTRACT_DAYS_BACK=90
  ```
- Create `.gitignore` (include: `.env`, `*.duckdb`, `dbt/profiles.yml`, `__pycache__`, `.dbt/`)
- Create `Makefile` with targets: `extract`, `dbt-run`, `dbt-test`, `app`, `all`
- Create `README.md` with setup instructions

---

### TASK 2 — Arbox extractor (`ingestion/arbox_extractor.py`)
Build a clean Python class `ArboxClient` with:
- `__init__(self, api_key, base_url)` — set up session with auth header
- `get_members(days_back=90)` → list of dicts
- `get_subscriptions(days_back=90)` → list of dicts
- `get_attendance(days_back=90)` → list of dicts
- Private `_paginate(endpoint, params)` → handles pagination automatically
- Private `_request(method, endpoint, **kwargs)` → handles retries (3x, exponential backoff)
- All methods return plain Python lists of dicts (no pandas dependency in extractor)

---

### TASK 3 — DuckDB loader (`ingestion/loader.py`)
Build `DuckDBLoader` class:
- `__init__(self, db_path)` — connect to DuckDB file
- `create_bronze_schema()` — CREATE SCHEMA IF NOT EXISTS bronze
- `load_members(records: list)` → upsert into `bronze.raw_members`
- `load_subscriptions(records: list)` → upsert into `bronze.raw_subscriptions`
- `load_attendance(records: list)` → upsert into `bronze.raw_attendance`
- Each table gets: all API fields + `_loaded_at TIMESTAMP` + `_source VARCHAR DEFAULT 'arbox'`
- Use DuckDB's `INSERT OR REPLACE` for upsert on Arbox primary key

Bronze table schemas to create:
```sql
-- bronze.raw_members
id VARCHAR PRIMARY KEY,
name VARCHAR,
email VARCHAR,
phone VARCHAR,
join_date DATE,
status VARCHAR,
raw_json JSON,          -- store full API response for safety
_loaded_at TIMESTAMP,
_source VARCHAR

-- bronze.raw_subscriptions
id VARCHAR PRIMARY KEY,
member_id VARCHAR,
plan_name VARCHAR,
start_date DATE,
end_date DATE,
price DECIMAL(10,2),
status VARCHAR,
raw_json JSON,
_loaded_at TIMESTAMP,
_source VARCHAR

-- bronze.raw_attendance
id VARCHAR PRIMARY KEY,
member_id VARCHAR,
class_id VARCHAR,
class_date DATE,
class_type VARCHAR,
raw_json JSON,
_loaded_at TIMESTAMP,
_source VARCHAR
```

---

### TASK 4 — Pipeline entrypoint (`ingestion/run_pipeline.py`)
Simple script that:
1. Loads `.env`
2. Instantiates `ArboxClient` and `DuckDBLoader`
3. Extracts all three endpoints
4. Loads all three into bronze
5. Runs `dbt run` as subprocess
6. Runs `dbt test` as subprocess
7. Prints summary: rows loaded per table, dbt exit code

---

### TASK 5 — dbt project config
- `dbt_project.yml`:
  - project name: `crossfit_whitecity`
  - models config:
    - `silver`: materialized as `table`
    - `gold`: materialized as `table`
- `profiles.yml.example` for DuckDB:
  ```yaml
  crossfit_whitecity:
    target: dev
    outputs:
      dev:
        type: duckdb
        path: "{{ env_var('DUCKDB_PATH') }}"
        schema: silver
  ```
- `models/bronze/sources.yml`: declare `bronze.raw_members`, `bronze.raw_subscriptions`, `bronze.raw_attendance` as sources

---

### TASK 6 — Silver models

**`dim_members.sql`**
- Source: `bronze.raw_members`
- Rename + cast: `member_id`, `full_name`, `email`, `phone`, `join_date` (DATE), `is_active` (BOOLEAN from status)
- Deduplicate on `member_id` (keep latest `_loaded_at`)
- Tests: `unique(member_id)`, `not_null(member_id, email)`

**`dim_subscriptions.sql`**
- Source: `bronze.raw_subscriptions`
- Cast: `start_date`, `end_date` as DATE, `price` as NUMERIC
- Add: `duration_days` (end_date - start_date), `is_current` (end_date >= CURRENT_DATE AND status = 'active')
- Tests: `not_null(id, member_id)`, `accepted_values(status, ['active','cancelled','paused','expired'])`

**`fct_attendance.sql`**
- Source: `bronze.raw_attendance`
- Cast: `class_date` as DATE
- Join to `dim_members` to add `full_name`
- Tests: `not_null(id, member_id, class_date)`

---

### TASK 7 — Gold models (standard SQL only)

**`kpi_active_members.sql`**
```sql
-- Active members count by plan type, as of today
SELECT
    plan_name,
    COUNT(DISTINCT member_id) AS active_members,
    CURRENT_DATE AS snapshot_date
FROM {{ ref('dim_subscriptions') }}
WHERE is_current = TRUE
GROUP BY plan_name
```

**`kpi_revenue_monthly.sql`**
```sql
-- Monthly recurring revenue
SELECT
    DATE_TRUNC('month', start_date) AS month,
    SUM(price) AS total_revenue,
    COUNT(DISTINCT member_id) AS paying_members
FROM {{ ref('dim_subscriptions') }}
WHERE status = 'active'
GROUP BY 1
ORDER BY 1
```

**`kpi_churn.sql`**
```sql
-- Monthly churn: cancelled subscriptions per month
SELECT
    DATE_TRUNC('month', end_date) AS month,
    COUNT(DISTINCT member_id) AS churned_members
FROM {{ ref('dim_subscriptions') }}
WHERE status = 'cancelled'
  AND end_date IS NOT NULL
GROUP BY 1
ORDER BY 1
```

**`kpi_attendance_weekly.sql`**
```sql
-- Weekly attendance count
SELECT
    DATE_TRUNC('week', class_date) AS week_start,
    COUNT(*) AS total_checkins,
    COUNT(DISTINCT member_id) AS unique_members
FROM {{ ref('fct_attendance') }}
GROUP BY 1
ORDER BY 1
```

---

### TASK 8 — Streamlit dashboard (`streamlit/app.py`)

Main app structure:
- Sidebar: last refresh timestamp, "Run pipeline" button (triggers `run_pipeline.py`)
- 3 pages via `st.navigation` or multipage

**Page 1 — Members (`pages/01_members.py`)**
- KPI cards: total active, new this month, churned this month
- Line chart: active members over time (from `kpi_active_members`)
- Bar chart: members by plan type

**Page 2 — Revenue (`pages/02_revenue.py`)**
- KPI cards: current MRR, avg revenue per member
- Line chart: MRR trend (from `kpi_revenue_monthly`)
- Bar chart: churn per month (from `kpi_churn`)

**Page 3 — Attendance (`pages/03_attendance.py`)**
- KPI cards: checkins this week, avg per week
- Bar chart: weekly attendance trend (from `kpi_attendance_weekly`)
- Table: top 10 most active members

**`streamlit/utils/db.py`**:
```python
import duckdb
import os
from dotenv import load_dotenv

load_dotenv()

def get_connection():
    return duckdb.connect(os.getenv("DUCKDB_PATH"), read_only=True)

def query(sql: str):
    con = get_connection()
    return con.execute(sql).df()  # returns pandas DataFrame
```

Use `st.cache_data(ttl=3600)` on all query functions.
Use Plotly for all charts (consistent with Phase 2 Metabase aesthetic).

---

## MVP ACCEPTANCE CRITERIA

Before calling Phase 1 done, verify ALL of these:

- [ ] `make all` runs without errors (extract → dbt run → dbt test)
- [ ] `bronze.raw_members`, `bronze.raw_subscriptions`, `bronze.raw_attendance` populated
- [ ] `dbt test` passes with 0 failures
- [ ] All 4 gold KPI tables have data
- [ ] `streamlit run streamlit/app.py` loads with real data
- [ ] All 3 dashboard pages render charts correctly
- [ ] `.env` is gitignored, `.env.example` is committed
- [ ] `README.md` has setup steps that a fresh reader can follow

---

## NOTES FOR PHASE 2 (do not build now — document only)

When MVP is approved, migration steps are:
1. Swap `dbt-duckdb` → `dbt-postgres` in requirements
2. Update `profiles.yml` to point at Supabase connection string
3. Deploy Modal app (`modal/pipeline.py`) with `@modal.cron("0 6 * * *")`
4. Replace Streamlit with Metabase connected to Supabase gold schema
5. Enable public Metabase dashboard URL for client

---

## START COMMAND

Begin with **TASK 1** — scaffold the full repo structure, create all config files,
`requirements.txt`, `.env.example`, `.gitignore`, `Makefile`, and `README.md`.

After Task 1, show me the file tree and wait for confirmation before proceeding to Task 2.
