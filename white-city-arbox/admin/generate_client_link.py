"""
CrossFit Box Dashboard — Client Onboarding Script
Usage:
  python generate_client_link.py --box-name "CrossFit TLV" \
    --box-email "owner@crossfittlv.com" --arbox-box-id 123
"""

import argparse
import csv
import os
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent.parent / ".env")

DASHBOARD_BASE_URL = os.environ.get("DASHBOARD_URL", "http://localhost:5173")
CSV_PATH           = Path(__file__).parent / "clients.csv"


def main():
    parser = argparse.ArgumentParser(description="Onboard a new CrossFit box client")
    parser.add_argument("--box-name",    required=True)
    parser.add_argument("--box-email",   required=True)
    parser.add_argument("--arbox-box-id", required=True, type=int)
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
        sys.exit(1)

    sb = create_client(supabase_url, supabase_key)

    # Insert box — Supabase auto-generates access_token via default
    result = sb.table("boxes").insert({
        "name":         args.box_name,
        "email":        args.box_email,
        "arbox_box_id": args.arbox_box_id,
    }).execute()

    if not result.data:
        print("❌ Failed to create box in Supabase")
        sys.exit(1)

    box = result.data[0]
    token       = box["access_token"]
    dashboard   = f"{DASHBOARD_BASE_URL}/dashboard/{token}"

    print(f"\n✅ Box created: {args.box_name}")
    print(f"🔗 Dashboard link: {dashboard}")
    print(f"📧 Send this link to: {args.box_email}")

    # Save to CSV
    write_header = not CSV_PATH.exists()
    with open(CSV_PATH, "a", newline="") as f:
        writer = csv.writer(f)
        if write_header:
            writer.writerow(["date", "box_name", "email", "arbox_box_id", "access_token", "dashboard_url"])
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d"),
            args.box_name,
            args.box_email,
            args.arbox_box_id,
            token,
            dashboard,
        ])

    print(f"💾 Saved to {CSV_PATH}\n")


if __name__ == "__main__":
    main()
