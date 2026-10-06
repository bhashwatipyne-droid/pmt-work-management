"""Tidy the imported ("PROJECT - nnn") project documents so they look like the
ones the app creates itself.

What it changes, on legacy projects only (ids starting "PROJECT - "):
  * start_date / end_date  "2025-07-07 05:30:00"  ->  "2025-07-07"
    (a date input and the date filters only understand the date part)
  * missing hidden / hidden_at / hidden_by  ->  False / None / None
    (projects you already hid - hidden: true - are never touched)
  * missing description  ->  ""
  * missing poc_id       ->  None

It does NOT invent project codes and does NOT touch the app-created projects.

Usage (from the backend folder, with MONGO_URL and DB_NAME set, e.g. from .env):
    python scripts/backfill_legacy_projects.py              # write the changes
    python scripts/backfill_legacy_projects.py --dry-run    # counts only, writes nothing

Safe to run more than once: a second run finds nothing left to change.
"""
import argparse
import os
import re
import sys

from pymongo import MongoClient, UpdateOne

LEGACY = {"id": {"$regex": "^PROJECT - "}}


def date_only(value):
    if isinstance(value, str) and len(value) > 10 and re.match(r"^\d{4}-\d{2}-\d{2}[ T]", value):
        return value[:10]
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="only print what would change")
    args = parser.parse_args()

    try:
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    except KeyError as missing:
        print(f"Set {missing.args[0]} first (see backend/.env.example).")
        return 1

    ops = []
    counts = {"dates": 0, "hidden": 0, "description": 0, "poc_id": 0}
    for doc in db.projects.find(LEGACY, {"start_date": 1, "end_date": 1, "hidden": 1, "description": 1, "poc_id": 1}):
        patch = {}
        for key in ("start_date", "end_date"):
            fixed = date_only(doc.get(key))
            if fixed != doc.get(key):
                patch[key] = fixed
        if any(k in patch for k in ("start_date", "end_date")):
            counts["dates"] += 1
        if "hidden" not in doc:
            patch.update({"hidden": False, "hidden_at": None, "hidden_by": None})
            counts["hidden"] += 1
        if "description" not in doc:
            patch["description"] = ""
            counts["description"] += 1
        if "poc_id" not in doc:
            patch["poc_id"] = None
            counts["poc_id"] += 1
        if patch:
            ops.append(UpdateOne({"_id": doc["_id"]}, {"$set": patch}))

    print(f"Legacy projects needing a change: {len(ops)}")
    for name, n in counts.items():
        print(f"  {name:<12} {n}")

    if not ops:
        return 0
    if args.dry_run:
        print("Dry run - nothing written.")
        return 0

    result = db.projects.bulk_write(ops, ordered=False)
    print(f"Updated {result.modified_count} projects.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
