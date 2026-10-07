"""Rename the stage "Animation" to "Animate" on deliverables.

The app's stages are Content, Design and Animate ("Animation" is only the name of
a department). 29 deliverables brought in from the old sheet carry "Animation" as
their current stage, so they match no stage anywhere: the export's Animate column
skips them and the stage boards do not know where to put them. This changes only
`current_stage`, nothing else.

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/fix_animation_stage.py             # report only - changes nothing
    python scripts/fix_animation_stage.py --apply     # saves a backup JSON, then fixes them

Safe to run again: a second run finds nothing left to change.
"""
import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect, save_backup  # noqa: E402

WRONG, RIGHT = "Animation", "Animate"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really change them (default: report only)")
    args = parser.parse_args()
    db = connect()

    docs = list(db.deliverables.find({"current_stage": WRONG}, {"_id": 0, "id": 1, "name": 1, "project_id": 1, "stage_status": 1}))
    print(f'{len(docs)} deliverables have current_stage "{WRONG}".')
    for d in docs[:10]:
        print(f"  {d['id']:<20} {d.get('stage_status', ''):<12} {d.get('name', '')[:60]}")
    if len(docs) > 10:
        print(f"  ... and {len(docs) - 10} more")
    if not docs:
        return 0
    if not args.apply:
        print("Report only - nothing changed. Run again with --apply to change them.")
        return 0

    backup = save_backup("fix_animation_stage", {"deliverables": list(db.deliverables.find({"current_stage": WRONG}))})
    print(f"Backup written: {backup}")
    result = db.deliverables.update_many(
        {"current_stage": WRONG},
        {"$set": {"current_stage": RIGHT, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    print(f'Changed {result.modified_count} deliverables to "{RIGHT}".')
    return 0


if __name__ == "__main__":
    sys.exit(main())
