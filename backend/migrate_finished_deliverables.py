"""One-off: bring legacy finished deliverables in line with the current import.

Older imports stored an already-finished deliverable as
    current_stage = "Finish", stage_status = "Closed"
The current import (deliverable_import.py) stores it at the LAST of its own
stages with stage_status = "Completed". Only those two fields change.

    python -m backend.migrate_finished_deliverables              # dry run (default)
    python -m backend.migrate_finished_deliverables --apply      # write, saving a backup file
    python -m backend.migrate_finished_deliverables --revert FILE  # undo from that backup

Needs MONGO_URL and DB_NAME in the environment (same as the API). The project
pages already display these rows correctly without this; running it only makes
the stored data consistent for every other consumer.
"""
import argparse
import json
import os
from datetime import datetime, timezone

from pymongo import MongoClient, UpdateOne

STAGES = ("Content", "Design", "Animate")
LEGACY = {"current_stage": "Finish", "stage_status": {"$in": ["Closed", "Completed"]}}


def target_stage(doc):
    own = [s for s in (doc.get("required_stages") or []) if s in STAGES]
    return own[-1] if own else "Content"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--revert", metavar="BACKUP_FILE")
    args = ap.parse_args()

    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    col = db.deliverables

    if args.revert:
        with open(args.revert, encoding="utf-8") as f:
            rows = json.load(f)
        res = col.bulk_write([
            UpdateOne({"id": r["id"]}, {"$set": {"current_stage": r["current_stage"], "stage_status": r["stage_status"]}})
            for r in rows
        ])
        print(f"Reverted {res.modified_count} of {len(rows)} deliverables.")
        return

    rows = list(col.find(LEGACY, {"_id": 0, "id": 1, "current_stage": 1, "stage_status": 1, "required_stages": 1}))
    plan = {}
    for r in rows:
        plan.setdefault(target_stage(r), []).append(r)

    print(f"{len(rows)} legacy finished deliverables found.")
    for stage, items in sorted(plan.items()):
        print(f"  -> current_stage={stage!r}, stage_status='Completed': {len(items)}")

    if not args.apply:
        print("Dry run: nothing written. Re-run with --apply to migrate.")
        return

    backup = f"finished_deliverables_backup_{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.json"
    with open(backup, "w", encoding="utf-8") as f:
        json.dump([{k: r[k] for k in ("id", "current_stage", "stage_status")} for r in rows], f, indent=1)
    print(f"Backup written to {backup}")

    res = col.bulk_write([
        UpdateOne(
            {"id": r["id"], "current_stage": "Finish"},
            {"$set": {"current_stage": target_stage(r), "stage_status": "Completed"}},
        )
        for r in rows
    ])
    print(f"Migrated {res.modified_count} deliverables.")


if __name__ == "__main__":
    main()
