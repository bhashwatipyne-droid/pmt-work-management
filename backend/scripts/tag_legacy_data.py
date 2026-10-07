"""Mark everything brought over from the old Google Sheet with source = "legacy_sheet".

Those records are recognisable by their ids, which the app never generates:
    projects      "PROJECT - nnn"
    deliverables  "DELIVERABLE - nnnn"
    work items    "WORKITEM - nnnn"

They are missing things the app now asks for (a client, a contact, dates, stages,
and for work items a link to a project and deliverable) because the sheet never
had them. Tagging them lets reports and checks leave them alone, and lets new
rules (a required client, say) apply only to records made in the app. Nothing
else about them changes, and records without the tag are app-made.

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/tag_legacy_data.py             # report only - changes nothing
    python scripts/tag_legacy_data.py --apply     # adds the tag

Safe to run again: only records without the tag are touched, and no backup is
needed because the only change is one added field.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect  # noqa: E402

TAG = {"source": "legacy_sheet"}
LEGACY_IDS = {
    "projects": "^PROJECT - ",
    "deliverables": "^DELIVERABLE - ",
    "work_items": "^WORKITEM - ",
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really add the tag (default: report only)")
    args = parser.parse_args()
    db = connect()

    total = 0
    for collection, pattern in LEGACY_IDS.items():
        untagged = {"id": {"$regex": pattern}, "source": {"$exists": False}}
        count = db[collection].count_documents(untagged)
        total += count
        tagged = db[collection].count_documents({"id": {"$regex": pattern}, "source": TAG["source"]})
        print(f"{collection:<13} {count:>5} to tag   ({tagged} already tagged)")
        if args.apply and count:
            result = db[collection].update_many(untagged, {"$set": TAG})
            print(f"{'':<13} tagged {result.modified_count}")

    if not args.apply:
        print("Report only - nothing changed. Run again with --apply to add the tag." if total else "Nothing to tag.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
