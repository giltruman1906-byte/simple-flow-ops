# CrossFit Box Dashboard — Build Guide
> Arbox API → Supabase → React → Vercel | Secure per-client links | Rolling 90-day data

---

## What You're Building

A beautiful 4-tab business dashboard for CrossFit box owners. You deploy it once, generate a unique secure link per client, and they open it on any device to see their live business metrics. No login screen — the link IS the access.

**Your revenue model:** Charge each box $150–250/month. Your cost is near $0.

---

## Architecture Overview

```
Arbox API
    ↓  (Python sync on Modal — runs daily at 3am)
Supabase (PostgreSQL)
    ↓  (row-level security per box token)
React App (hosted on Vercel)
    ↓
https://your-app.vercel.app/dashboard/{secret-token}
```

---

## Tech Stack & Cost

| Layer | Tool | Monthly Cost |
|---|---|---|
| Data source | Arbox API | $0 (included in client's plan) |
| Sync engine | Python on Modal | ~$0–5 (pay per run second) |
| Database | Supabase | $0 free tier / $25 pro |
| Frontend | React + Vite | $0 |
| Hosting | Vercel | $0 free tier |
| Domain (optional) | Any registrar | ~$1/mo |
| **Total** | | **$0–30/mo** |

---

## Prerequisites

Before you start, have these ready:

- [ ] Node.js 18+ installed (`node -v`)
- [ ] Python 3.10+ installed (`python --version`)
- [ ] Supabase account — [supabase.com](https://supabase.com) (free)
- [ ] Modal account — [modal.com](https://modal.com) (free)
- [ ] Vercel account — [vercel.com](https://vercel.com) (free)
- [ ] GitHub account (Vercel deploys from GitHub)
- [ ] Arbox API key from the box owner's account (Settings → API)

---

## Project Structure

```
crossfit-dashboard/
├── frontend/                    ← React app (Vite)
│   ├── src/
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   ├── lib/
│   │   │   └── supabase.js      ← Supabase client
│   │   └── tabs/
│   │       ├── Revenue.jsx      ← Tab 1: MRR, payments, overdue
│   │       ├── Members.jsx      ← Tab 2: Active, churn, retention
│   │       ├── Classes.jsx      ← Tab 3: Attendance, coaches, heatmap
│   │       └── Alerts.jsx       ← Tab 4: At-risk, overdue, expiring
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── sync_arbox.py            ← Modal cron: Arbox → Supabase
│   └── requirements.txt
│
├── supabase/
│   ├── schema.sql               ← Tables + RLS policies
│   └── seed.sql                 ← Test box + fake 90-day data
│
├── admin/
│   └── generate_client_link.py  ← Onboard new box → print secure URL
│
└── README.md
```

---

## Phase 1 — Supabase Setup

### 1.1 Create your project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Save your **Project URL** and **anon key** (Settings → API)
3. Also save your **service role key** (used by the Python sync only)

### 1.2 Run the schema

In the Supabase SQL Editor, run `supabase/schema.sql`.

This creates:

- `boxes` — one row per CrossFit client (name, email, access_token)
- `members` — active/inactive members with join date
- `memberships` — plan type, price, start/end dates
- `payments` — amount, status (paid/pending/overdue), date
- `classes` — schedule entries with coach and capacity
- `attendance` — member check-ins per class

All tables have:
- `box_id` (foreign key → boxes)
- `created_at` (used for the 90-day rolling window)
- Row Level Security (RLS) so each token only sees its own box

### 1.3 Run the seed data

Run `supabase/seed.sql` to create a test box with 90 days of fake data.
It will print a test token — save it, you'll use it to test the dashboard.

### Claude Code prompt for Phase 1:

```
Create a Supabase PostgreSQL schema for a CrossFit box business dashboard.

Requirements:
- Multi-tenant: each box has a box_id and a unique access_token (UUID)
- Tables needed: boxes, members, memberships, payments, classes, attendance
- Rolling 3-month data: all tables except boxes have created_at, records older
  than 90 days are deleted by a pg_cron job daily at 2am
- Row Level Security (RLS): queries filtered by box_id, authenticated via
  access_token matched in the boxes table
- Add a Postgres function: get_box_id_from_token(token UUID) returns box_id
- Add indexes on box_id and created_at on every table

Output:
1. supabase/schema.sql — full table definitions + RLS policies + pg_cron job
2. supabase/seed.sql — 1 test box + realistic fake data for 90 days
```

---

## Phase 2 — Python Sync on Modal

### 2.1 Install Modal

```bash
pip install modal
modal setup   # opens browser to authenticate
```

### 2.2 Set secrets in Modal

In the Modal dashboard (or CLI), create a secret called `arbox-dashboard` with:

```
ARBOX_API_KEY=your_key_here
ARBOX_BOX_ID=your_box_id
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

### 2.3 Deploy the sync

```bash
cd backend
modal deploy sync_arbox.py
```

The sync will run every day at 3am Israel time (Asia/Jerusalem). It:

1. Pulls members, memberships, payments, classes, attendance from Arbox
2. Only fetches the last 90 days
3. Upserts into Supabase (safe to re-run)
4. Deletes records older than 90 days to maintain the rolling window

### 2.4 Test a manual run

```bash
modal run sync_arbox.py::sync_now
```

### Claude Code prompt for Phase 2:

```
Write a Python sync script to run on Modal that pulls data from the Arbox API
and upserts it into Supabase.

Arbox base URL: https://arboxserver.arboxapp.com/api/v1
Supabase: use supabase-py client

Environment variables (from Modal secret named 'arbox-dashboard'):
- ARBOX_API_KEY
- ARBOX_BOX_ID
- SUPABASE_URL
- SUPABASE_SERVICE_KEY

Sync these endpoints:
1. GET /members → members table (active/inactive, join_date, email, phone)
2. GET /memberships → memberships table (type, start_date, end_date, price, status)
3. GET /payments → payments table (amount, status: paid/pending/overdue, date)
4. GET /schedule → classes table (name, coach, datetime, max_capacity)
5. GET /attendance → attendance table (member_id, class_id, checked_in)

Rules:
- Only pull records from last 90 days
- Use upsert so re-runs are safe
- Run on Modal as a daily cron at 3am Asia/Jerusalem
- Add error handling and logging per endpoint
- After sync, delete records older than 90 days from all tables
- Expose a sync_now function for manual testing

Output: backend/sync_arbox.py + backend/requirements.txt
```

---

## Phase 3 — React Dashboard

### 3.1 Create the app

```bash
npm create vite@latest frontend -- --template react
cd frontend
npm install @supabase/supabase-js recharts react-router-dom
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

### 3.2 Set environment variables

Create `frontend/.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 3.3 Run locally

```bash
npm run dev
```

Open: `http://localhost:5173/dashboard/YOUR_TEST_TOKEN`

### 3.4 The 4 tabs

**Tab 1 — Revenue**
- KPI cards: MRR, collected this month, overdue, avg revenue per member
- Line chart: weekly revenue last 12 weeks
- Donut chart: paid vs pending vs overdue
- Table: top 10 overdue members

**Tab 2 — Members**
- KPI cards: total active, new this month, churned this month, retention rate
- Bar chart: new members per month (last 3 months)
- Line chart: member growth
- Table: newest 10 members

**Tab 3 — Classes & Attendance**
- KPI cards: classes this month, avg attendance, most popular class, busiest day
- Bar chart: attendance by class type
- Heatmap: attendance by day × hour
- Table: top 5 coaches by attendance

**Tab 4 — Health Alerts**
- At-risk members (no check-in in 14+ days) — red badge
- Overdue payments — orange badge
- Memberships expiring in 14 days — yellow badge
- Copy email button on each row

### Claude Code prompt for Phase 3:

```
Build a production-ready React + Vite dashboard for CrossFit box owners.

Tech: React 18, Vite, @supabase/supabase-js, Recharts, TailwindCSS, React Router

Auth model:
- No login screen
- URL pattern: /dashboard/:token
- On load: call Supabase RPC get_box_id_from_token(token) to resolve box_id
- Invalid token → "Access denied" page
- Valid token → load all dashboard data for that box only

Build 4 tabs: Revenue, Members, Classes & Attendance, Health Alerts
(full spec described in the README Phase 3 section)

Design: dark sidebar, CrossFit energy — bold, high contrast, professional
Add loading skeletons while data fetches and empty states for no alerts.
Mobile responsive. Deploy-ready for Vercel.

Output: complete frontend/ folder
```

---

## Phase 4 — Deploy to Vercel

### 4.1 Push to GitHub

```bash
git init
git add .
git commit -m "initial commit"
gh repo create crossfit-dashboard --public
git push -u origin main
```

### 4.2 Connect to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
2. Select your repo
3. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Root directory: `frontend`
5. Click Deploy

Your app is live at: `https://crossfit-dashboard.vercel.app`

### 4.3 Add a custom domain (optional)

In Vercel → Settings → Domains → add `dashboard.yourcompany.com`

---

## Phase 5 — Onboarding a New Client

### 5.1 Run the admin script

```bash
python admin/generate_client_link.py \
  --box-name "CrossFit TLV" \
  --box-email "owner@crossfittlv.com" \
  --arbox-api-key "their_api_key"
```

Output:

```
✅ Box created: CrossFit TLV
🔗 Dashboard link: https://crossfit-dashboard.vercel.app/dashboard/a3f7b2c1-...
📧 Send this link to: owner@crossfittlv.com
💾 Saved to clients.csv
```

### 5.2 Add their Arbox API key to Modal

In Modal dashboard → Secrets → add a new secret per client, or update the
sync script to handle multiple box IDs from a config table in Supabase.

### 5.3 Send the link

Send the URL to the box owner. They bookmark it and open it any time on
any device — no login needed.

### Claude Code prompt for Phase 5:

```
Build a Python CLI script: admin/generate_client_link.py

Arguments: --box-name, --box-email, --arbox-api-key
Actions:
1. Insert new row into Supabase boxes table (auto-generate UUID token)
2. Print the secure dashboard URL
3. Log box name, email, token, date to admin/clients.csv

Use environment variables for SUPABASE_URL and SUPABASE_SERVICE_KEY.

Output: admin/generate_client_link.py
```

---

## The 90-Day Rolling Window

This is how you stay lean on server costs:

- Every sync deletes records older than 90 days from all tables
- A pg_cron job in Supabase also runs this cleanup daily at 2am
- The `boxes` table is never deleted (it holds your client registry)
- Once a box owner is paying and happy, you upgrade to 1 year rolling
  by changing `90` to `365` in two places:
  - `backend/sync_arbox.py` — the fetch window
  - `supabase/schema.sql` — the pg_cron cleanup job

No infrastructure changes needed. Supabase free tier handles ~500MB which
covers roughly 10–15 active box clients on a 90-day window comfortably.

---

## Security Model

Each client gets a UUID token (e.g. `a3f7b2c1-4d5e-6f7a-8b9c-0d1e2f3a4b5c`).

- The token is passed in the URL: `/dashboard/{token}`
- Supabase RLS policies verify the token on every query
- The anon key (in the React app) cannot bypass RLS
- A leaked token only exposes that one box's read-only data
- To revoke access: delete the token from the boxes table in Supabase

---

## Build Order Checklist

```
[ ] 1. Create Supabase project, save URL + keys
[ ] 2. Run schema.sql in Supabase SQL editor
[ ] 3. Run seed.sql, save the test token
[ ] 4. Set up Modal account, install CLI
[ ] 5. Add Modal secret: arbox-dashboard
[ ] 6. Deploy backend/sync_arbox.py to Modal
[ ] 7. Run manual sync: modal run sync_arbox.py::sync_now
[ ] 8. Verify data in Supabase table viewer
[ ] 9. Create React app, install dependencies
[ ] 10. Set frontend/.env with Supabase keys
[ ] 11. npm run dev → test all 4 tabs with seed token
[ ] 12. Push to GitHub
[ ] 13. Deploy on Vercel, set env vars
[ ] 14. Test live URL with seed token
[ ] 15. Run generate_client_link.py for first real client
[ ] 16. Share link, collect payment 💰
```

---

## Pricing Suggestion

| Tier | Price | What's included |
|---|---|---|
| Starter | $150/mo | Dashboard + 90-day history + email support |
| Growth | $250/mo | Dashboard + 1-year history + WhatsApp alerts |
| Agency | $500/mo | Up to 5 boxes under one account |

Your hard cost per client: ~$2–5/mo (Modal compute + Supabase share).

---

## Questions & Support

Built by SimpleFlow Ops — [simpleflowops.com](https://simpleflowops.com)

For Arbox API documentation: https://arboxserver.arboxapp.com/docs/api