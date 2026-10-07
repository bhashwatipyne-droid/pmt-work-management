"""Find projects that are exact copies of each other and hide the extras.

A "copy" is very strict: same client, same name (ignoring case and punctuation),
same start and end date, the same list of deliverables (name + type), and NO work
logged against any of them. Anything that fails that test is only listed, with the
reason, for a person to decide (for example a monthly job that really did repeat).

Within a group of copies it keeps the most advanced one (Raised Invoice, then Ready
for Invoice, then Completed ... and the oldest on a tie) and hides the rest. Hiding
is the same "Hide" the app has on a project, so it is undone with Unhide on the
Projects page. Nothing is deleted. For each hidden copy it also hides its pending
approval cards, which would otherwise keep showing in the Approvals queue (the
project Hide button does not do that), and notes `duplicate_of` on the project.

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/dedupe_projects.py            # report only - changes nothing
    python scripts/dedupe_projects.py --apply    # saves a backup JSON, then hides the copies

Safe to run again: hidden projects are skipped, so a second run finds nothing new.
"""
import argparse
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect, save_backup  # noqa: E402
from project_duplicates import normalize_project_name, parse_timestamp  # noqa: E402

HIDDEN_BY = "script:dedupe_projects"

# Which copy to keep: the furthest along the money trail wins.
KEEP_ORDER = ["Raised Invoice", "Ready for Invoice", "Completed", "Approval Pending", "Active", "On Hold", "Scrapped"]


def keep_rank(project):
    status = project.get("status")
    created = parse_timestamp(project.get("created_at")) or datetime.max.replace(tzinfo=timezone.utc)
    return (KEEP_ORDER.index(status) if status in KEEP_ORDER else len(KEEP_ORDER), created, str(project.get("id")))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really hide the copies (default: report only)")
    args = parser.parse_args()
    db = connect()

    visible = list(db.projects.find({"hidden": {"$ne": True}}, {"_id": 0}))
    groups = defaultdict(list)
    for project in visible:
        key = (project.get("client_id") or None, normalize_project_name(project.get("name")))
        if key[1]:
            groups[key].append(project)
    groups = {key: members for key, members in groups.items() if len(members) > 1}
    print(f"{len(visible)} visible projects, {len(groups)} sets with the same client and name.\n")

    ids = [p["id"] for members in groups.values() for p in members]
    deliverables = defaultdict(list)
    for d in db.deliverables.find({"project_id": {"$in": ids}}, {"_id": 0, "id": 1, "project_id": 1, "name": 1, "type": 1}):
        deliverables[d["project_id"]].append(d)
    worked = {
        row["_id"]: row["n"]
        for row in db.work_items.aggregate([
            {"$match": {"project_id": {"$in": ids}}},
            {"$group": {"_id": "$project_id", "n": {"$sum": 1}}},
        ])
    }

    def deliverable_signature(project_id):
        return sorted(
            (normalize_project_name(d.get("name")), (d.get("type") or "").strip().lower())
            for d in deliverables[project_id]
        )

    to_hide = []  # (copy, keeper)
    for (client_id, _), members in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        members.sort(key=keep_rank)
        keeper, others = members[0], members[1:]
        label = f"{keeper['name']!r}  client={client_id}  x{len(members)}"

        reasons = []
        if len({(p.get("start_date"), p.get("end_date")) for p in members}) > 1:
            reasons.append("their dates differ")
        if len({tuple(deliverable_signature(p["id"])) for p in members}) > 1:
            reasons.append("their deliverables differ")
        busy = [p["id"] for p in members if worked.get(p["id"])]
        if busy:
            reasons.append(f"work is logged against {len(busy)} of them")

        if reasons:
            print(f"LEFT ALONE  {label}\n            because {', and '.join(reasons)}")
            for p in members:
                print(f"            - {p['id']:<16} {p.get('status', ''):<17} {p.get('start_date') or '-'} to {p.get('end_date') or '-'}"
                      f"  {len(deliverables[p['id']])} deliverables, {worked.get(p['id'], 0)} work items")
            print()
            continue

        print(f"EXACT COPIES  {label}\n              keep {keeper['id']} ({keeper.get('status')}); hide {len(others)}: "
              + ", ".join(f"{p['id']} ({p.get('status')})" for p in others) + "\n")
        to_hide.extend((p, keeper) for p in others)

    if not to_hide:
        print("Nothing to hide.")
        return 0

    hide_ids = [p["id"] for p, _ in to_hide]
    deliverable_ids = [d["id"] for pid in hide_ids for d in deliverables[pid]]
    pending = db.approval_items.count_documents(
        {"deliverable_id": {"$in": deliverable_ids}, "hidden": {"$ne": True}, "status": "PENDING"}
    )
    print(f"{len(to_hide)} projects would be hidden, with {len(deliverable_ids)} deliverables and {pending} pending approval cards.")

    if not args.apply:
        print("Report only - nothing changed. Run again with --apply to hide them.")
        return 0

    backup = save_backup("dedupe_projects", {
        "projects": list(db.projects.find({"id": {"$in": hide_ids}})),
        "approval_items": list(db.approval_items.find({"deliverable_id": {"$in": deliverable_ids}})),
    })
    print(f"Backup written: {backup}")

    now = datetime.now(timezone.utc).isoformat()
    for project, keeper in to_hide:
        db.projects.update_one(
            {"id": project["id"]},
            {"$set": {"hidden": True, "hidden_at": now, "hidden_by": HIDDEN_BY, "duplicate_of": keeper["id"], "updated_at": now}},
        )
    hidden = db.approval_items.update_many(
        {"deliverable_id": {"$in": deliverable_ids}, "hidden": {"$ne": True}},
        {"$set": {"hidden": True, "hidden_at": now, "hidden_by": HIDDEN_BY, "updated_at": now}},
    )
    print(f"Hid {len(to_hide)} projects and {hidden.modified_count} approval cards.")
    print("To undo: Unhide the project on the Projects page (Hidden view). The backup file lists every approval card that was hidden with it.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
