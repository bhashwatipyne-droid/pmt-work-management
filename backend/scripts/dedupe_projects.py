"""Find projects that are exact copies of each other and hide the extras.

A "copy" is very strict: same client, same name (ignoring case and punctuation),
same start and end date, the same list of deliverables (name + type), and NO work
logged against any of them. Inside a set of same-named projects it finds the groups
of identical copies and hides all but one of each group. A project that differs from
the rest (other dates, other deliverables, or work logged) is never touched, only
listed with what is different so a person can decide.

Within a group of copies it keeps the most advanced one (Raised Invoice, then Ready
for Invoice, then Completed ... and the oldest on a tie) and hides the rest. Hiding
is the same "Hide" the app has on a project, so it is undone with Unhide on the
Projects page. Nothing is deleted. For each hidden copy it also hides its pending
approval cards, which would otherwise keep showing in the Approvals queue (the
project Hide button does not do that), and notes `duplicate_of` on the project.

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/dedupe_projects.py                  # report only - changes nothing
    python scripts/dedupe_projects.py --apply          # saves a backup JSON, then hides the copies

    --treat-as-copies "Project name"   (repeatable)
        Treat EVERY project with this name as copies of one another even though a
        deliverable differs (say one was renamed). Still refuses if their dates
        differ or work is logged against any of them. Use it only after reading
        what differs in the report.

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


def describe_difference(project, other, deliverables):
    """What sets `project` apart from `other`, in a few words."""
    parts = []
    if (project.get("start_date"), project.get("end_date")) != (other.get("start_date"), other.get("end_date")):
        parts.append(f"dates {project.get('start_date') or '-'} to {project.get('end_date') or '-'}")
    mine = {(d.get("name") or "").strip() for d in deliverables[project["id"]]}
    theirs = {(d.get("name") or "").strip() for d in deliverables[other["id"]]}
    only_here = sorted(mine - theirs)
    if only_here:
        shown = "; ".join(repr(n) for n in only_here[:3]) + (f" (+{len(only_here) - 3} more)" if len(only_here) > 3 else "")
        parts.append(f"only here: {shown}")
    only_there = len(theirs - mine)
    if only_there:
        parts.append(f"missing {only_there} that the others have")
    if not parts and len(deliverables[project["id"]]) != len(deliverables[other["id"]]):
        parts.append("a different number of deliverables")
    return ", ".join(parts) or "differs in type or repeats"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really hide the copies (default: report only)")
    parser.add_argument("--treat-as-copies", action="append", default=[], metavar="NAME",
                        help="treat every project with this name as copies (see above); repeatable")
    args = parser.parse_args()
    force_names = {normalize_project_name(n) for n in args.treat_as_copies}
    db = connect()

    visible = list(db.projects.find({"hidden": {"$ne": True}}, {"_id": 0}))
    groups = defaultdict(list)
    for project in visible:
        key = (project.get("client_id") or None, normalize_project_name(project.get("name")))
        if key[1]:
            groups[key].append(project)
    groups = {key: members for key, members in groups.items() if len(members) > 1}
    print(f"{len(visible)} visible projects, {len(groups)} sets with the same client and name.\n")
    for name in sorted(force_names - {name for _, name in groups}):
        print(f"NOTE: --treat-as-copies {name!r} matches no set of same-named projects.\n")

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

    def signature(project, with_deliverables=True):
        sig = [project.get("start_date"), project.get("end_date")]
        if with_deliverables:
            sig.append(tuple(sorted(
                (normalize_project_name(d.get("name")), (d.get("type") or "").strip().lower())
                for d in deliverables[project["id"]]
            )))
        return tuple(sig)

    def line(p):
        return (f"{p['id']:<16} {p.get('status', ''):<17} {p.get('start_date') or '-'} to {p.get('end_date') or '-'}"
                f"  {len(deliverables[p['id']])} deliverables, {worked.get(p['id'], 0)} work items")

    to_hide = []  # (copy, keeper)
    for (client_id, name_key), members in sorted(groups.items(), key=lambda kv: -len(kv[1])):
        members.sort(key=keep_rank)
        forced = name_key in force_names
        # Identical projects form a cluster. With --treat-as-copies the deliverables
        # may differ, but the dates must still agree.
        clusters = defaultdict(list)
        for p in members:
            clusters[signature(p, with_deliverables=not forced)].append(p)

        print(f"{members[0]['name']!r}  client={client_id}  x{len(members)}")
        left_alone = []
        for cluster in clusters.values():
            if len(cluster) == 1:
                left_alone.append(cluster[0])
                continue
            busy = [p for p in cluster if worked.get(p["id"])]
            if busy:
                print(f"   LEFT ALONE  {len(cluster)} identical projects, but work is logged against {len(busy)} of them:")
                for p in cluster:
                    print(f"      - {line(p)}")
                continue
            keeper, others = cluster[0], cluster[1:]
            print(f"   {'TREATED AS COPIES' if forced else 'EXACT COPIES'}  keep {keeper['id']} ({keeper.get('status')}); "
                  f"hide {len(others)}: " + ", ".join(p["id"] for p in others))
            if forced:
                for p in others:
                    if signature(p) != signature(keeper):
                        print(f"      note {p['id']} differs from the kept one: {describe_difference(p, keeper, deliverables)}")
            to_hide.extend((p, keeper) for p in others)

        for p in left_alone:
            others = [m for m in members if m is not p]
            print(f"   LEFT ALONE  {line(p)}")
            print(f"               differs: {describe_difference(p, others[0], deliverables)}")
        print()

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
