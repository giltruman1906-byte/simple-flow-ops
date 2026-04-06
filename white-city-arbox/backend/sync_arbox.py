"""
CrossFit Box Dashboard — Arbox → Supabase Sync
Runs daily at 3am Israel time via Modal cron.
Pulls last 90 days of data only.
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

import modal
import httpx
from supabase import create_client, Client

# ─── Logging ────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ─── Modal setup ────────────────────────────────────────────
app = modal.App("arbox-sync")

image = modal.Image.debian_slim().pip_install(
    "httpx",
    "supabase",
    "python-dateutil",
)

secret = modal.Secret.from_name("arbox-dashboard")

# ─── Constants ──────────────────────────────────────────────
ARBOX_BASE_URL = "https://arboxserver.arboxapp.com/api/v1"
ROLLING_DAYS   = 90


# ─── Helpers ────────────────────────────────────────────────
def get_cutoff() -> str:
    """ISO date string 90 days ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=ROLLING_DAYS)
    return cutoff.strftime("%Y-%m-%d")


def arbox_headers(api_key: str) -> dict:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }


def arbox_get(client: httpx.Client, endpoint: str, params: dict = None) -> list[dict]:
    """GET from Arbox API with basic error handling."""
    url = f"{ARBOX_BASE_URL}/{endpoint}"
    try:
        resp = client.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        # Arbox wraps responses in {data: [...]} or returns list directly
        if isinstance(data, list):
            return data
        return data.get("data", data.get("results", []))
    except httpx.HTTPStatusError as e:
        log.error(f"Arbox API error {endpoint}: {e.response.status_code} — {e.response.text}")
        return []
    except Exception as e:
        log.error(f"Arbox request failed {endpoint}: {e}")
        return []


def upsert(sb: Client, table: str, rows: list[dict], conflict_cols: list[str]) -> int:
    """Upsert rows into Supabase. Returns count upserted."""
    if not rows:
        return 0
    try:
        sb.table(table).upsert(rows, on_conflict=",".join(conflict_cols)).execute()
        log.info(f"  ✓ {table}: upserted {len(rows)} rows")
        return len(rows)
    except Exception as e:
        log.error(f"  ✗ {table} upsert failed: {e}")
        return 0


def delete_old(sb: Client, table: str, cutoff: str) -> None:
    """Delete records older than cutoff date."""
    try:
        sb.table(table).delete().lt("created_at", cutoff).execute()
        log.info(f"  ✓ {table}: deleted records older than {cutoff}")
    except Exception as e:
        log.error(f"  ✗ {table} cleanup failed: {e}")


# ─── Sync functions ─────────────────────────────────────────
def sync_members(arbox: httpx.Client, sb: Client, box_id: str, arbox_box_id: str, cutoff: str) -> dict[int, str]:
    """Returns {arbox_member_id: supabase_member_uuid}"""
    log.info("Syncing members...")
    raw = arbox_get(arbox, f"boxes/{arbox_box_id}/members", {"from": cutoff})

    rows = []
    for m in raw:
        rows.append({
            "box_id":          box_id,
            "arbox_member_id": m.get("id"),
            "name":            (m.get("first_name", "") + " " + m.get("last_name", "")).strip() or m.get("name", "Unknown"),
            "email":           m.get("email"),
            "phone":           m.get("phone"),
            "status":          "active" if m.get("active", True) else "inactive",
            "join_date":       m.get("created_at", m.get("join_date")),
            "created_at":      m.get("created_at"),
        })

    upsert(sb, "members", rows, ["box_id", "arbox_member_id"])

    # Build id map for foreign keys
    result = sb.table("members").select("id, arbox_member_id").eq("box_id", box_id).execute()
    return {r["arbox_member_id"]: r["id"] for r in result.data}


def sync_memberships(arbox: httpx.Client, sb: Client, box_id: str, arbox_box_id: str,
                     member_map: dict, cutoff: str) -> None:
    log.info("Syncing memberships...")
    raw = arbox_get(arbox, f"boxes/{arbox_box_id}/memberships", {"from": cutoff})

    rows = []
    for ms in raw:
        arbox_mid = ms.get("user_id", ms.get("member_id"))
        supabase_mid = member_map.get(arbox_mid)
        if not supabase_mid:
            continue
        rows.append({
            "box_id":                 box_id,
            "member_id":              supabase_mid,
            "arbox_membership_id":    ms.get("id"),
            "plan_type":              ms.get("membership_type", ms.get("type")),
            "price":                  ms.get("price", 0),
            "start_date":             ms.get("start_date"),
            "end_date":               ms.get("end_date"),
            "status":                 ms.get("status", "active"),
            "created_at":             ms.get("created_at"),
        })

    upsert(sb, "memberships", rows, ["box_id", "arbox_membership_id"])


def sync_payments(arbox: httpx.Client, sb: Client, box_id: str, arbox_box_id: str,
                  member_map: dict, cutoff: str) -> None:
    log.info("Syncing payments...")
    raw = arbox_get(arbox, f"boxes/{arbox_box_id}/payments", {"from": cutoff})

    rows = []
    for p in raw:
        arbox_mid = p.get("user_id", p.get("member_id"))
        supabase_mid = member_map.get(arbox_mid)
        if not supabase_mid:
            continue

        # Normalize status
        raw_status = str(p.get("status", "pending")).lower()
        if raw_status in ("paid", "completed", "success"):
            status = "paid"
        elif raw_status in ("overdue", "late", "failed"):
            status = "overdue"
        else:
            status = "pending"

        rows.append({
            "box_id":           box_id,
            "member_id":        supabase_mid,
            "arbox_payment_id": p.get("id"),
            "amount":           p.get("amount", 0),
            "status":           status,
            "payment_date":     p.get("payment_date", p.get("date")),
            "created_at":       p.get("created_at", p.get("date")),
        })

    upsert(sb, "payments", rows, ["box_id", "arbox_payment_id"])


def sync_classes(arbox: httpx.Client, sb: Client, box_id: str, arbox_box_id: str,
                 cutoff: str) -> dict[int, str]:
    """Returns {arbox_class_id: supabase_class_uuid}"""
    log.info("Syncing classes...")
    raw = arbox_get(arbox, f"boxes/{arbox_box_id}/schedule", {"from": cutoff})

    rows = []
    for c in raw:
        rows.append({
            "box_id":          box_id,
            "arbox_class_id":  c.get("id"),
            "name":            c.get("name", c.get("class_name", "WOD")),
            "coach":           c.get("coach", c.get("instructor")),
            "scheduled_at":    c.get("start_time", c.get("scheduled_at")),
            "max_capacity":    c.get("max_capacity", c.get("capacity", 20)),
            "created_at":      c.get("created_at", c.get("start_time")),
        })

    upsert(sb, "classes", rows, ["box_id", "arbox_class_id"])

    result = sb.table("classes").select("id, arbox_class_id").eq("box_id", box_id).execute()
    return {r["arbox_class_id"]: r["id"] for r in result.data}


def sync_attendance(arbox: httpx.Client, sb: Client, box_id: str, arbox_box_id: str,
                    member_map: dict, class_map: dict, cutoff: str) -> None:
    log.info("Syncing attendance...")
    raw = arbox_get(arbox, f"boxes/{arbox_box_id}/attendance", {"from": cutoff})

    rows = []
    for a in raw:
        arbox_mid  = a.get("user_id", a.get("member_id"))
        arbox_cid  = a.get("schedule_id", a.get("class_id"))
        supabase_mid = member_map.get(arbox_mid)
        supabase_cid = class_map.get(arbox_cid)
        if not supabase_mid or not supabase_cid:
            continue
        rows.append({
            "box_id":      box_id,
            "member_id":   supabase_mid,
            "class_id":    supabase_cid,
            "checked_in":  True,
            "attended_at": a.get("check_in_time", a.get("attended_at")),
            "created_at":  a.get("created_at", a.get("check_in_time")),
        })

    upsert(sb, "attendance", rows, ["box_id", "member_id", "class_id"])


def run_cleanup(sb: Client, cutoff: str) -> None:
    log.info("Cleaning up records older than 90 days...")
    for table in ["attendance", "payments", "memberships", "classes", "members"]:
        delete_old(sb, table, cutoff)


# ─── Main sync ──────────────────────────────────────────────
def do_sync():
    api_key       = os.environ["ARBOX_API_KEY"]
    arbox_box_id  = os.environ["ARBOX_BOX_ID"]
    supabase_url  = os.environ["SUPABASE_URL"]
    supabase_key  = os.environ["SUPABASE_SERVICE_KEY"]

    cutoff = get_cutoff()
    log.info(f"Starting sync — box {arbox_box_id} — cutoff {cutoff}")

    sb: Client = create_client(supabase_url, supabase_key)

    # Get or create box record
    box_result = sb.table("boxes").select("id").eq("arbox_box_id", int(arbox_box_id)).execute()
    if not box_result.data:
        log.error(f"No box found in Supabase with arbox_box_id={arbox_box_id}. Run generate_client_link.py first.")
        return
    box_id = box_result.data[0]["id"]
    log.info(f"Box resolved: {box_id}")

    with httpx.Client(headers=arbox_headers(api_key)) as arbox:
        member_map = sync_members(arbox, sb, box_id, arbox_box_id, cutoff)
        sync_memberships(arbox, sb, box_id, arbox_box_id, member_map, cutoff)
        sync_payments(arbox, sb, box_id, arbox_box_id, member_map, cutoff)
        class_map = sync_classes(arbox, sb, box_id, arbox_box_id, cutoff)
        sync_attendance(arbox, sb, box_id, arbox_box_id, member_map, class_map, cutoff)

    run_cleanup(sb, cutoff)
    log.info("✅ Sync complete.")


# ─── Modal entry points ─────────────────────────────────────
@app.function(image=image, secrets=[secret], schedule=modal.Cron("0 3 * * *"), timeout=300)
def sync_scheduled():
    """Runs automatically every day at 3am Asia/Jerusalem (UTC+3 = 00:00 UTC)."""
    do_sync()


@app.function(image=image, secrets=[secret], timeout=300)
def sync_now():
    """Manual trigger: modal run sync_arbox.py::sync_now"""
    do_sync()


if __name__ == "__main__":
    # Local test (requires .env loaded)
    from dotenv import load_dotenv
    load_dotenv("../../.env")
    do_sync()
