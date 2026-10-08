"""Set "Changes" and "Client Meets & Discussions" to 120 min per unit for everyone
in the Animation department (their potential is derived from these minutes).

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/set_animation_targets.py           # report only
    python scripts/set_animation_targets.py --apply   # backs up, then saves them

Safe to run again. Existing rows are updated (and activated); missing ones are created.
"""
import argparse
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect, save_backup  # noqa: E402

ACTIVITIES = ["Changes", "Client Meets & Discussions"]
MINUTES = 120


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db = connect()

    users = list(db.users.find({"department": "Animation", "role": {"$ne": "admin"}, "active": {"$ne": False}},
                               {"_id": 0, "id": 1, "name": 1}))
    print(f"{len(users)} Animation employees.")
    ids = [u["id"] for u in users]
    old = list(db.efficiency_employee_targets.find({"user_id": {"$in": ids}, "activity_name": {"$in": ACTIVITIES}}))
    for u in users:
        print(f"  {u.get('name')}")
    if not args.apply:
        print("Report only - run again with --apply.")
        return 0

    print(f"Backup written: {save_backup('set_animation_targets', {'targets': old})}")
    now = datetime.now(timezone.utc).isoformat()
    for u in users:
        for act in ACTIVITIES:
            db.efficiency_employee_targets.update_one(
                {"user_id": u["id"], "activity_name": act},
                {"$set": {"category": "Core", "time_per_unit_minutes": MINUTES, "active": True, "updated_at": now},
                 "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                upsert=True,
            )
    print(f"Set {', '.join(ACTIVITIES)} to {MINUTES} min for {len(users)} people.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
