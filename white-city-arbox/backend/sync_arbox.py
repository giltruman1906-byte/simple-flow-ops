"""
CrossFit White City — Arbox → Supabase Sync
API: Arbox Public v3  (https://arboxserver.arboxapp.com/api/public/v3/)
Auth: api-key header

Data pulled:
  members       — membersPropertiesReport + activeMembersReport
  memberships   — activeMembershipsReport
  payments      — salesReport YTD (Jan 1 – today)
  classes       — classesSummaryReport YTD (aggregate per session)
  bookings      — bookingsReport YTD (one row per member × class, with check_in status)
  leads         — leads YTD (Jan 1 – today)
  freezes       — membersOnHoldReport (last 12 months)

Run locally:
  cd white-city-arbox && python backend/sync_arbox.py

Run on Modal:
  modal run backend/sync_arbox.py::sync_now
"""

import os
import logging
import time
from datetime import date, datetime, timezone
from typing import Any

import httpx
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(os.path.join(os.path.dirname(__file__), "../../.env"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── Constants ──────────────────────────────────────────────
ARBOX_BASE_URL  = "https://arboxserver.arboxapp.com/api/public/v3"
YTD_FROM_DATE   = "2026-01-01"                     # payments, classes, bookings
LEADS_FROM_DATE = "2024-01-01"                     # leads: go further back to capture history
PAGE_SIZE       = 200


# ─── Helpers ────────────────────────────────────────────────
def arbox_headers(api_key: str) -> dict:
    return {
        "api-key": api_key,
        "Content-Type": "application/json",
    }


def month_ranges(from_date: str, to_date: str) -> list[tuple[str, str]]:
    """Return list of (from, to) date strings split into ≤31-day chunks by month."""
    from datetime import date
    import calendar
    start = date.fromisoformat(from_date)
    end   = date.fromisoformat(to_date)
    ranges = []
    cur = start
    while cur <= end:
        last_day = calendar.monthrange(cur.year, cur.month)[1]
        month_end = min(date(cur.year, cur.month, last_day), end)
        ranges.append((cur.isoformat(), month_end.isoformat()))
        if month_end >= end:
            break
        # first day of next month
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    return ranges


def normalize_lead_status(raw: str | None) -> str:
    """Map Arbox Hebrew lead status to our enum: new|in_progress|trial_booked|converted|lost"""
    if not raw:
        return "new"
    r = raw.lower()
    if any(w in r for w in ["converted", "הפך", "member"]):
        return "converted"
    if any(w in r for w in ["lost", "אבד", "לא רלוונטי"]):
        return "lost"
    if any(w in r for w in ["trial", "נסיון", "ניסיון"]):
        return "trial_booked"
    if any(w in r for w in ["process", "בתהליך", "follow"]):
        return "in_progress"
    return "new"


def arbox_get_all(client: httpx.Client, endpoint: str, params: dict = None) -> list[dict]:
    """Fetch all pages from a paginated Arbox v3 endpoint."""
    params = params or {}
    params["results_per_page"] = PAGE_SIZE
    all_data = []
    page = 1

    while True:
        url = f"{ARBOX_BASE_URL}/{endpoint}"
        try:
            resp = client.get(url, params={**params, "page": page}, timeout=30)
            resp.raise_for_status()
            body = resp.json()
        except httpx.HTTPStatusError as e:
            log.error(f"HTTP error {endpoint} page {page}: {e.response.status_code} — {e.response.text[:200]}")
            break
        except Exception as e:
            log.error(f"Request failed {endpoint} page {page}: {e}")
            break

        data = body.get("data") or []
        if not data:
            break

        all_data.extend(data)

        pagination = body.get("extra", {}).get("pagination", {})
        total_pages = pagination.get("total_pages", 1)
        log.debug(f"  {endpoint} page {page}/{total_pages} — {len(data)} records")

        if page >= total_pages:
            break
        page += 1
        time.sleep(0.1)   # be polite to the API

    log.info(f"  ✓ {endpoint}: fetched {len(all_data)} total records")
    return all_data


def upsert(sb: Client, table: str, rows: list[dict], conflict_cols: list[str]) -> int:
    if not rows:
        log.info(f"  — {table}: no rows to upsert")
        return 0
    try:
        # Supabase upsert in batches of 500 to avoid request size limits
        for i in range(0, len(rows), 500):
            batch = rows[i:i + 500]
            sb.table(table).upsert(batch, on_conflict=",".join(conflict_cols)).execute()
        log.info(f"  ✓ {table}: upserted {len(rows)} rows")
        return len(rows)
    except Exception as e:
        log.error(f"  ✗ {table} upsert failed: {e}")
        return 0


def normalize_date(val: str | None) -> str | None:
    """Return None for garbage dates like '0000-00-00'."""
    if not val or val.startswith("0000") or val.startswith("-"):
        return None
    return val[:10]   # trim to YYYY-MM-DD


def normalize_datetime(val: str | None) -> str | None:
    if not val or val.startswith("0000") or val.startswith("-"):
        return None
    return val


# ─── Sync: Members ──────────────────────────────────────────
def sync_members(arbox: httpx.Client, sb: Client, box_id: str, location_id: str) -> dict[int, str]:
    """
    Members = membersPropertiesReport (~975 members with profiles)
              + activeMembersReport   (to determine active/inactive status)
    Returns {arbox_user_id: supabase_member_uuid}
    """
    log.info("Syncing members...")

    # Step 1: get the set of active user IDs
    active_raw = arbox_get_all(arbox, "reports/activeMembersReport",
                               {"location_id": location_id})
    active_ids = {m["user_id"] for m in active_raw}
    log.info(f"  Active members: {len(active_ids)}")

    # Step 2: pull full member profiles
    props_raw = arbox_get_all(arbox, "reports/membersPropertiesReport",
                              {"location_id": location_id})
    log.info(f"  Profile records: {len(props_raw)}")

    rows = []
    for m in props_raw:
        uid = m.get("user_id")
        if not uid:
            continue
        rows.append({
            "box_id":          box_id,
            "arbox_member_id": uid,
            "name":            m.get("name", "Unknown"),
            "email":           m.get("email"),
            "phone":           m.get("phone"),
            "status":          "active" if uid in active_ids else "inactive",
            "join_date":       None,   # filled below from memberships
        })

    upsert(sb, "members", rows, ["box_id", "arbox_member_id"])

    # Build id map
    result = sb.table("members").select("id, arbox_member_id").eq("box_id", box_id).execute()
    return {r["arbox_member_id"]: r["id"] for r in result.data}


# ─── Sync: Memberships ──────────────────────────────────────
def sync_memberships(arbox: httpx.Client, sb: Client, box_id: str, location_id: str,
                     member_map: dict) -> None:
    """
    Uses activeMembershipsReport — 885 current active memberships.
    Also back-fills join_date on the members table using member_since.
    """
    log.info("Syncing memberships...")
    raw = arbox_get_all(arbox, "reports/activeMembershipsReport",
                        {"location_id": location_id})

    rows = []
    join_date_updates = {}   # user_id → member_since

    for ms in raw:
        uid = ms.get("user_id")
        supabase_mid = member_map.get(uid)
        if not supabase_mid:
            continue

        # Map status: Arbox returns "active" | "on_hold" | "cancelled" | "expired"
        raw_status = str(ms.get("status", "active")).lower()
        if raw_status in ("cancelled", "cancel"):
            status = "cancelled"
        elif raw_status in ("expired",):
            status = "expired"
        else:
            status = "active"

        rows.append({
            "box_id":               box_id,
            "member_id":            supabase_mid,
            "arbox_membership_id":  ms["membership_user_id"],
            "plan_type":            ms.get("membership_type_name"),
            "price":                ms.get("price", 0),
            "start_date":           normalize_date(ms.get("start_date")),
            "end_date":             normalize_date(ms.get("end_date")),
            "status":               status,
            "created_at":           normalize_datetime(ms.get("purchase_date")),
        })

        # Collect member_since to update join_date
        since = normalize_date(ms.get("member_since"))
        if since and uid not in join_date_updates:
            join_date_updates[uid] = since

    upsert(sb, "memberships", rows, ["box_id", "arbox_membership_id"])

    # Back-fill join_date on members
    log.info(f"  Back-filling join_date for {len(join_date_updates)} members...")
    for uid, since in join_date_updates.items():
        supabase_mid = member_map.get(uid)
        if supabase_mid:
            try:
                sb.table("members").update({"join_date": since}).eq("id", supabase_mid).execute()
            except Exception as e:
                log.warning(f"  Could not update join_date for member {uid}: {e}")


# ─── Sync: Payments ─────────────────────────────────────────
def sync_payments(arbox: httpx.Client, sb: Client, box_id: str, location_id: str,
                  member_map: dict) -> None:
    """
    Uses salesReport for YTD (Jan 1 – today), chunked monthly (API max 31 days).
    Each sale row = one payment / membership purchase.
    """
    log.info("Syncing payments (YTD, monthly chunks)...")
    to_date = date.today().isoformat()
    raw = []
    for from_dt, to_dt in month_ranges(YTD_FROM_DATE, to_date):
        log.info(f"  Fetching payments {from_dt} → {to_dt}")
        chunk = arbox_get_all(arbox, "reports/salesReport", {
            "location_id": location_id,
            "fromDate":    from_dt,
            "toDate":      to_dt,
        })
        raw.extend(chunk)

    rows = []
    for p in raw:
        uid = p.get("user_id")
        supabase_mid = member_map.get(uid)
        if not supabase_mid:
            continue

        # Determine payment status from debt / paid amounts
        price = float(p.get("price") or 0)
        paid  = float(p.get("paid") or 0)
        debt  = float(p.get("debt") or 0)

        if debt > 0:
            status = "overdue"
        elif paid >= price and price > 0:
            status = "paid"
        else:
            status = "pending"

        rows.append({
            "box_id":           box_id,
            "member_id":        supabase_mid,
            "arbox_payment_id": p["sale_id"],
            "amount":           price,
            "status":           status,
            "payment_date":     normalize_date(p.get("date")),
            "created_at":       normalize_datetime(p.get("date")),
        })

    upsert(sb, "payments", rows, ["box_id", "arbox_payment_id"])


# ─── Sync: Classes ──────────────────────────────────────────
def sync_classes(arbox: httpx.Client, sb: Client, box_id: str, location_id: str) -> None:
    """
    Uses classesSummaryReport for YTD.
    One row per class session — includes check_in (aggregate count).
    Note: check_in_count is stored in the name field prefix as we have no extra column.
          To store check_in properly, add a migration to the classes table.
    """
    log.info("Syncing classes (YTD, monthly chunks)...")
    to_date = date.today().isoformat()
    raw = []
    for from_dt, to_dt in month_ranges(YTD_FROM_DATE, to_date):
        log.info(f"  Fetching classes {from_dt} → {to_dt}")
        chunk = arbox_get_all(arbox, "reports/classesSummaryReport", {
            "location_id": location_id,
            "fromDate":    from_dt,
            "toDate":      to_dt,
        })
        raw.extend(chunk)

    rows = []
    for c in raw:
        sid = c.get("schedule_id")
        if not sid:
            continue

        date_str = c.get("date", "")
        time_str = c.get("start_time", "00:00")
        scheduled_at = f"{date_str}T{time_str}:00" if date_str else None

        coach = c.get("staff_member", "").strip() or None

        rows.append({
            "box_id":         box_id,
            "arbox_class_id": sid,
            "name":           c.get("class_name") or c.get("series_name") or "WOD",
            "coach":          coach,
            "scheduled_at":   scheduled_at,
            "max_capacity":   c.get("max_participants") or 20,
            "created_at":     scheduled_at,
        })

    upsert(sb, "classes", rows, ["box_id", "arbox_class_id"])


# ─── Sync: Bookings ─────────────────────────────────────────
def sync_bookings(arbox: httpx.Client, sb: Client, box_id: str, location_id: str,
                  member_map: dict) -> None:
    """
    Uses bookingsReport — one row per member × class session.
    Fields: user_id, date, time, class_name, space_name, staff_member,
            check_in (Yes/No), is_first_session (Yes/No), membership_type_name.
    Chunked monthly (API returns paginated results).
    member_map: arbox user_id → supabase member UUID
    """
    log.info("Syncing bookings (YTD, monthly chunks)...")
    to_date = date.today().isoformat()
    raw = []
    for from_dt, to_dt in month_ranges(YTD_FROM_DATE, to_date):
        log.info(f"  Fetching bookings {from_dt} → {to_dt}")
        chunk = arbox_get_all(arbox, "reports/bookingsReport", {
            "location_id": location_id,
            "fromDate":    from_dt,
            "toDate":      to_dt,
        })
        raw.extend(chunk)

    rows = []
    for b in raw:
        uid = b.get("user_id")
        if not uid:
            continue
        # Skip non-client rows (staff entries sometimes appear)
        if b.get("user_role", "client") not in ("client", ""):
            continue

        rows.append({
            "box_id":           box_id,
            "member_id":        member_map.get(uid),
            "arbox_user_id":    uid,
            "class_name":       b.get("class_name") or b.get("class_name"),
            "space_name":       b.get("space_name"),
            "coach":            (b.get("staff_member") or "").strip() or None,
            "booked_date":      normalize_date(b.get("date")),
            "booked_time":      b.get("time"),
            "checked_in":       b.get("check_in", "").lower() == "yes",
            "is_first_session": b.get("is_first_session", "").lower() == "yes",
            "membership_type":  b.get("membership_type_name"),
            "sessions_left":    b.get("sessions_left") if str(b.get("sessions_left", "")).isdigit() else None,
        })

    log.info(f"  Upserting {len(rows)} booking records")
    upsert(sb, "bookings", rows, ["box_id", "arbox_user_id", "booked_date", "booked_time", "class_name"])


# ─── Sync: Leads ────────────────────────────────────────────
def _normalize_phone(phone: str | None) -> str | None:
    """Strip all non-digits then take last 9 digits for comparison."""
    if not phone:
        return None
    digits = "".join(c for c in phone if c.isdigit())
    return digits[-9:] if len(digits) >= 9 else digits or None


def sync_leads(arbox: httpx.Client, sb: Client, box_id: str, location_id: str) -> None:
    """
    Sync open pipeline leads from Arbox.

    Arbox only returns currently-open leads — converted and lost leads
    are removed from the /leads endpoint. We detect these by comparing
    the current API response against our DB:
      - Disappeared + phone matches a member  → converted
      - Disappeared + no member phone match   → lost
    """
    log.info("Syncing leads...")

    # ── 1. Fetch from Arbox (note: camelCase fromDate, not from_date) ──
    raw = arbox_get_all(arbox, "leads", {
        "location_id": location_id,
        "fromDate":    LEADS_FROM_DATE,
    })
    api_lead_ids = {lead.get("user_id") for lead in raw if lead.get("user_id")}

    # ── 2. Upsert open leads ──
    rows = []
    for lead in raw:
        uid = lead.get("user_id")
        if not uid:
            continue
        rows.append({
            "box_id":        box_id,
            "arbox_lead_id": uid,
            "first_name":    lead.get("first_name") or "",
            "last_name":     lead.get("last_name") or "",
            "email":         lead.get("email"),
            "phone":         lead.get("phone"),
            "status":        normalize_lead_status(lead.get("lead_status")),
            "source":        lead.get("lead_source"),
            "created_at":    normalize_datetime(lead.get("created_time")),
        })
    if rows:
        upsert(sb, "leads", rows, ["box_id", "arbox_lead_id"])

    # ── 3. Detect disappeared leads (left the pipeline since last sync) ──
    db_leads_result = (
        sb.table("leads")
        .select("id, arbox_lead_id, phone")
        .eq("box_id", box_id)
        .not_.in_("status", ["converted", "lost"])
        .execute()
    )
    db_leads = db_leads_result.data or []

    # Build normalised phone → member lookup (last 9 digits)
    members_result = (
        sb.table("members")
        .select("phone")
        .eq("box_id", box_id)
        .not_.is_("phone", "null")
        .execute()
    )
    member_phones = {
        _normalize_phone(m["phone"])
        for m in (members_result.data or [])
        if _normalize_phone(m["phone"])
    }

    converted_ids, lost_ids = [], []
    for lead in db_leads:
        if lead["arbox_lead_id"] in api_lead_ids:
            continue  # still in pipeline — no change
        # Disappeared from API — classify
        if _normalize_phone(lead["phone"]) in member_phones:
            converted_ids.append(lead["id"])
        else:
            lost_ids.append(lead["id"])

    if converted_ids:
        log.info(f"  Marking {len(converted_ids)} leads as converted")
        sb.table("leads").update({"status": "converted"}).in_("id", converted_ids).execute()

    if lost_ids:
        log.info(f"  Marking {len(lost_ids)} leads as lost")
        sb.table("leads").update({"status": "lost"}).in_("id", lost_ids).execute()

    log.info(f"  Leads synced: {len(rows)} open, {len(converted_ids)} converted, {len(lost_ids)} lost")


# ─── Sync: Freezes (membership holds) ──────────────────────
def sync_freezes(arbox: httpx.Client, sb: Client, box_id: str, location_id: str,
                 member_map: dict) -> None:
    """
    Uses membersOnHoldReport — requires ≤31-day date ranges.
    Pulls last 12 months so we capture all active/recent freezes.
    member_map: arbox user_id → supabase member UUID
    """
    log.info("Syncing freezes (holds)...")

    # Build date: 12 months back → today
    from_date = str(date.today().replace(year=date.today().year - 1))
    raw = []
    for from_dt, to_dt in month_ranges(from_date, str(date.today())):
        log.info(f"  Fetching freezes {from_dt} → {to_dt}")
        chunk = arbox_get_all(arbox, "reports/membersOnHoldReport", {
            "location_id": location_id,
            "fromDate":    from_dt,
            "toDate":      to_dt,
        })
        raw.extend(chunk)

    # Deduplicate by arbox_hold_id (monthly chunks overlap)
    unique: dict[int, Any] = {}
    for h in raw:
        hid = h.get("membership_hold_id")
        if hid:
            unique[hid] = h

    rows = []
    for hid, h in unique.items():
        uid = h.get("user_id")
        rows.append({
            "box_id":               box_id,
            "member_id":            member_map.get(uid),
            "arbox_hold_id":        hid,
            "arbox_membership_id":  h.get("membership_user_id"),
            "plan_type":            h.get("membership_type_name"),
            "freeze_start":         normalize_date(h.get("start_suspend_time")),
            "freeze_end":           normalize_date(h.get("end_suspend_time")),
            "total_days":           h.get("total_days"),
            "reason":               h.get("suspend_reason"),
            "task_status":          h.get("task_status"),
            "price":                h.get("price", 0),
        })

    log.info(f"  Upserting {len(rows)} freeze records")
    upsert(sb, "freezes", rows, ["box_id", "arbox_hold_id"])


# ─── Clear seed data ────────────────────────────────────────
def clear_seed_data(sb: Client, box_id: str) -> None:
    """Delete fake seed data — arbox IDs < 10000 are synthetic."""
    log.info("Clearing seed data (arbox IDs < 10000)...")
    try:
        sb.table("attendance").delete().eq("box_id", box_id).execute()
        sb.table("payments").delete().lt("arbox_payment_id", 10000).eq("box_id", box_id).execute()
        sb.table("classes").delete().lt("arbox_class_id", 10000).eq("box_id", box_id).execute()
        sb.table("memberships").delete().lt("arbox_membership_id", 10000).eq("box_id", box_id).execute()
        sb.table("members").delete().lt("arbox_member_id", 10000).eq("box_id", box_id).execute()
        sb.table("leads").delete().lt("arbox_lead_id", 10000).eq("box_id", box_id).execute()
        log.info("  ✓ Seed data cleared")
    except Exception as e:
        log.error(f"  ✗ Seed data cleanup failed: {e}")


# ─── Main sync ──────────────────────────────────────────────
def do_sync():
    api_key      = os.environ["ARBOX_API_KEY"]
    location_id  = os.environ["ARBOX_LOCATION_ID"]
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_KEY"]

    log.info(f"Starting sync — location {location_id} — YTD from {YTD_FROM_DATE}")

    sb: Client = create_client(supabase_url, supabase_key)

    # Resolve box_id from Supabase
    box_result = sb.table("boxes").select("id").eq("arbox_box_id", int(location_id)).execute()
    if not box_result.data:
        log.error(f"No box found in Supabase with arbox_box_id={location_id}. Run admin/generate_client_link.py first.")
        return
    box_id = box_result.data[0]["id"]
    log.info(f"Box resolved: {box_id}")

    # Clear synthetic seed data first
    clear_seed_data(sb, box_id)

    with httpx.Client(headers=arbox_headers(api_key)) as arbox:
        member_map = sync_members(arbox, sb, box_id, location_id)
        sync_memberships(arbox, sb, box_id, location_id, member_map)
        sync_payments(arbox, sb, box_id, location_id, member_map)
        sync_classes(arbox, sb, box_id, location_id)
        sync_bookings(arbox, sb, box_id, location_id, member_map)
        sync_leads(arbox, sb, box_id, location_id)
        sync_freezes(arbox, sb, box_id, location_id, member_map)


def do_sync_partial():
    """Only re-run payments, classes, leads — skip members/memberships (already loaded)."""
    api_key      = os.environ["ARBOX_API_KEY"]
    location_id  = os.environ["ARBOX_LOCATION_ID"]
    supabase_url = os.environ["SUPABASE_URL"]
    supabase_key = os.environ["SUPABASE_SERVICE_KEY"]

    log.info(f"Partial sync — location {location_id} — payments + classes + leads")

    sb: Client = create_client(supabase_url, supabase_key)
    box_result = sb.table("boxes").select("id").eq("arbox_box_id", int(location_id)).execute()
    box_id = box_result.data[0]["id"]

    # Load member_map from existing Supabase data
    result = sb.table("members").select("id, arbox_member_id").eq("box_id", box_id).execute()
    member_map = {r["arbox_member_id"]: r["id"] for r in result.data}
    log.info(f"Loaded {len(member_map)} members from Supabase")

    with httpx.Client(headers=arbox_headers(api_key)) as arbox:
        sync_payments(arbox, sb, box_id, location_id, member_map)
        sync_classes(arbox, sb, box_id, location_id)
        sync_bookings(arbox, sb, box_id, location_id, member_map)
        sync_leads(arbox, sb, box_id, location_id)
        sync_freezes(arbox, sb, box_id, location_id, member_map)

    log.info("✅ Partial sync complete.")

    log.info("✅ Sync complete.")


# ─── Entry points ───────────────────────────────────────────
if __name__ == "__main__":
    do_sync_partial()


# ─── Modal (optional — uncomment to deploy) ─────────────────
# import modal
# app = modal.App("arbox-sync")
# image = modal.Image.debian_slim().pip_install("httpx", "supabase", "python-dotenv")
# secret = modal.Secret.from_name("arbox-dashboard")
#
# @app.function(image=image, secrets=[secret], schedule=modal.Cron("0 3 * * *"), timeout=600)
# def sync_scheduled():
#     do_sync()
#
# @app.function(image=image, secrets=[secret], timeout=600)
# def sync_now():
#     do_sync()
