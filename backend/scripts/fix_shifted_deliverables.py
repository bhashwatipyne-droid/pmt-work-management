"""Move deliverables back to the project they belong to, where the old sheet import
attached them to the wrong one.

The import shifted deliverables down by one or two projects over a run of legacy
projects (about PROJECT - 781 to 872): for example PROJECT - 803 "Retirement Standee"
holds the deliverable "AGM Video - PPT Graphs", which belongs to PROJECT - 801.

For every deliverable currently in those projects it compares the deliverable's name
with the names of the project it is in and the four before it (and one after), and
gives a verdict:

    STAY            its name matches the project it is in
    MOVE high       its name equals / contains the name of another project, and not its own
    MOVE medium     several words match another project clearly better than its own
    MOVE inferred   no name matches anywhere, but the rest of its project (or the
                    projects around it) are all shifted by the same amount, so it
                    is assumed to be shifted too. Check these by eye.
    UNSURE          nothing convincing; left where it is

Only the deliverable's project_id changes (its approvals, stages and history follow
it). A work item linked to a moved deliverable follows it only when the work item's
own deliverable name matches; any others are listed for a manual look and not touched.
Each move is logged in the deliverable's activity log.

Usage (backend folder; MONGO_URL and DB_NAME in backend/.env or the terminal):
    python scripts/fix_shifted_deliverables.py                    # report only
    python scripts/fix_shifted_deliverables.py --csv review.csv   # report + a sheet to read in Excel
    python scripts/fix_shifted_deliverables.py --apply            # move the HIGH moves (saves a backup first)
    python scripts/fix_shifted_deliverables.py --apply --confidence medium     # high + medium
    python scripts/fix_shifted_deliverables.py --apply --confidence inferred   # all three kinds
    python scripts/fix_shifted_deliverables.py --undo script_backups/<file>.json   # put a run's moves back

    --from / --to   the first and last PROJECT number to look at (default 781 to 872)
    --skip ID       leave this deliverable where it is, whatever the verdict (repeatable)
    --unlink-work-items
                    work items the report lists as CHECK (linked to a deliverable that moves,
                    but not about it) get their deliverable link cleared instead of being
                    left pointing at another project's deliverable. Project is untouched.

Choose the level once and apply it in ONE run. The "inferred" moves rest on the shifted
projects around them, which stop looking shifted as soon as they are moved, so they
cannot be applied in a second run after the high ones. (If that happens, undo, then
apply again with --confidence inferred.) Otherwise it is safe to run again: after a
move the deliverable matches its project, so it is a STAY.
"""
import argparse
import csv
import json
import re
import sys
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import connect, save_backup  # noqa: E402
from project_duplicates import normalize_project_name  # noqa: E402

CHANGED_BY = "script:fix_shifted_deliverables"
LEVELS = {"high": 1, "medium": 2, "inferred": 3}
STOP = {
    "and", "the", "for", "of", "fund", "funds", "video", "ppt", "as", "on", "data", "with", "new", "one",
    "a", "in", "to", "mf", "campaign", "updation", "updatation", "av", "creative", "creatives", "version",
}
LOOK_BEFORE, LOOK_AFTER = 4, 1  # a deliverable may belong up to 4 projects earlier, or 1 later


def project_number(project_id):
    match = re.fullmatch(r"PROJECT - (\d+)", project_id or "")
    return int(match.group(1)) if match else None


def tokens(text):
    return {t for t in normalize_project_name(text).split() if t not in STOP}


def match_score(deliverable_name, project_name):
    """0-100: how strongly the deliverable's name points at this project."""
    a, b = normalize_project_name(deliverable_name), normalize_project_name(project_name)
    if not a or not b:
        return 0
    if a == b:
        return 100
    short, long_ = (a, b) if len(a) <= len(b) else (b, a)
    if (len(short.split()) >= 2 or len(short) >= 8) and short in long_:
        return 90
    ta, tb = tokens(deliverable_name), tokens(project_name)
    shared = len(ta & tb)
    if not shared:
        return 0
    if shared == 1:
        return 25
    return min(80, int(80 * shared / min(len(ta), len(tb))))


def classify(deliverables, names):
    """verdict per deliverable id -> dict(verdict, level, target, offset, score, reason)."""
    out, evidence = {}, defaultdict(list)  # evidence[project number] -> offsets seen with confidence
    for d in deliverables:
        n = project_number(d["project_id"])
        own = match_score(d["name"], names[n])
        others = sorted(
            ((match_score(d["name"], names[m]), m) for m in range(n - LOOK_BEFORE, n + LOOK_AFTER + 1) if m != n and m in names),
            reverse=True,
        )
        best, best_m = others[0] if others else (0, None)
        unique = best_m is not None and (len(others) < 2 or others[1][0] < best)
        if own >= 90:
            out[d["id"]] = dict(verdict="STAY", reason="name matches its own project")
            evidence[n].append(0)
        elif best >= 90 and best > own and unique:
            out[d["id"]] = dict(verdict="MOVE", level="high", target=best_m, score=best, reason="name matches that project")
            evidence[n].append(n - best_m)
        elif best >= 60 and best >= own + 30 and unique:
            out[d["id"]] = dict(verdict="MOVE", level="medium", target=best_m, score=best, reason="several words match that project")
        else:
            out[d["id"]] = dict(verdict="UNSURE", reason="no project name matches clearly")

    def majority(offsets):
        counts = Counter(offsets)
        return counts.most_common(1)[0][0] if counts and len(counts) == 1 else None

    # Second pass: follow the rest of the project, or the projects around it.
    for d in deliverables:
        if out[d["id"]]["verdict"] != "UNSURE":
            continue
        n = project_number(d["project_id"])
        own_evidence = evidence.get(n)
        offset, why = None, ""
        if own_evidence:
            offset, why = majority(own_evidence), "the rest of its project is shifted the same way"
        else:
            around = [majority(evidence[m]) for m in range(n - LOOK_BEFORE, n + LOOK_BEFORE + 1) if m != n and m in evidence]
            around = [o for o in around if o is not None]
            if len(around) >= 3 and len(set(around)) == 1:
                offset, why = around[0], f"{len(around)} neighbouring projects are all shifted the same way"
        if offset and (n - offset) in names:
            out[d["id"]] = dict(verdict="MOVE", level="inferred", target=n - offset, score=0, reason=why)
    return out


def pid(n):
    return f"PROJECT - {n:03d}"


def undo(db, path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    n = 0
    for doc in data.get("deliverables", []):
        n += db.deliverables.update_one({"id": doc["id"]}, {"$set": {"project_id": doc["project_id"]}}).modified_count
    for doc in data.get("work_items", []):
        db.work_items.update_one({"id": doc["id"]}, {"$set": {"project_id": doc["project_id"], "client_id": doc.get("client_id")}})
    for doc in data.get("work_items_unlinked", []):
        db.work_items.update_one({"id": doc["id"]}, {"$set": {"deliverable_id": doc.get("deliverable_id", "")}})
    print(f"Put {n} deliverables and {len(data.get('work_items', [])) + len(data.get('work_items_unlinked', []))} work items back as the backup had them.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="really move them (default: report only)")
    parser.add_argument("--confidence", choices=list(LEVELS), default="high", help="lowest confidence to move (default high)")
    parser.add_argument("--from", dest="first", type=int, default=781)
    parser.add_argument("--to", dest="last", type=int, default=872)
    parser.add_argument("--csv", metavar="FILE", help="also write the full list as a CSV to review")
    parser.add_argument("--undo", metavar="BACKUP_JSON", help="reverse the moves recorded in a backup file")
    parser.add_argument("--skip", action="append", default=[], metavar="ID", help="leave this deliverable where it is (repeatable)")
    parser.add_argument("--unlink-work-items", action="store_true", help="clear the deliverable link of CHECK work items")
    args = parser.parse_args()
    db = connect()

    if args.undo:
        undo(db, args.undo)
        return 0

    projects = {}
    for p in db.projects.find({"id": {"$regex": r"^PROJECT - \d+$"}}, {"_id": 0, "id": 1, "name": 1, "client_id": 1}):
        projects[project_number(p["id"])] = p
    names = {n: p["name"] for n, p in projects.items() if args.first - LOOK_BEFORE <= n <= args.last + LOOK_AFTER}

    in_scope = [pid(n) for n in range(args.first, args.last + 1)]
    deliverables = list(db.deliverables.find({"project_id": {"$in": in_scope}}, {"_id": 0}))
    deliverables.sort(key=lambda d: (d["project_id"], d.get("name") or ""))
    verdicts = classify(deliverables, names)
    by_id = {d["id"]: d for d in deliverables}
    for skipped in args.skip:
        if skipped in verdicts:
            verdicts[skipped] = dict(verdict="UNSURE", reason="skipped with --skip")
        else:
            print(f"NOTE: --skip {skipped!r} is not a deliverable in this range.")

    counts = Counter((v["verdict"], v.get("level")) for v in verdicts.values())
    print(f"{len(deliverables)} deliverables in PROJECT - {args.first:03d} to {args.last:03d}:")
    print(f"  stay {counts[('STAY', None)]}   move high {counts[('MOVE', 'high')]}   move medium {counts[('MOVE', 'medium')]}"
          f"   move inferred {counts[('MOVE', 'inferred')]}   unsure {counts[('UNSURE', None)]}\n")

    def show(title, items):
        if not items:
            return
        print(title)
        for d in items:
            v = verdicts[d["id"]]
            if v["verdict"] == "MOVE":
                t = v["target"]
                print(f"  {d['id']:<20} {d.get('name', '')[:46]!r:<50} {d['project_id'][10:]} -> {t:03d}  ({names[t][:42]})")
            else:
                print(f"  {d['id']:<20} {d.get('name', '')[:46]!r:<50} in {d['project_id'][10:]}  ({names[project_number(d['project_id'])][:42]})")
        print()

    for level in LEVELS:
        show(f"MOVE {level.upper()}:", [d for d in deliverables if verdicts[d["id"]].get("level") == level])
    show("UNSURE (left where they are):", [d for d in deliverables if verdicts[d["id"]]["verdict"] == "UNSURE"])

    wanted = LEVELS[args.confidence]
    moving = [d for d in deliverables if verdicts[d["id"]]["verdict"] == "MOVE" and LEVELS[verdicts[d["id"]]["level"]] <= wanted]

    # Work items attached to the deliverables that would move.
    linked = list(db.work_items.find({"deliverable_id": {"$in": [d["id"] for d in moving]}}, {"_id": 0}))
    follow, leave = [], []
    for w in linked:
        d = by_id[w["deliverable_id"]]
        same = normalize_project_name(w.get("deliverable_name")) == normalize_project_name(d.get("name"))
        (follow if same else leave).append(w)
    if linked:
        print("Work items linked to a deliverable that moves:")
        for w in follow:
            print(f"  FOLLOWS  {w['id'][:8]}  {w.get('deliverable_name')!r}: project {w.get('project_id')[10:]} -> {verdicts[w['deliverable_id']]['target']:03d}")
        for w in leave:
            d = by_id[w["deliverable_id"]]
            action = "link will be cleared" if args.unlink_work_items else "left alone (add --unlink-work-items to clear its link)"
            print(f"  CHECK    {w['id'][:8]}  work item says {w.get('deliverable_name')!r}, linked to {d.get('name')!r}; {action} (project {w.get('project_id', '')[10:]})")
        print()

    if counts[("MOVE", "inferred")]:
        print("Note: 'inferred' moves depend on the other shifted projects in this same run, so apply them together\n"
              "(--confidence inferred), not after the high ones.\n")
    gain = Counter(verdicts[d["id"]]["target"] for d in moving)
    print(f"{len(moving)} deliverables would move at confidence '{args.confidence}' or better; {len(gain)} projects gain deliverables.")

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f)
            w.writerow(["deliverable_id", "deliverable", "type", "now_in", "now_in_name", "verdict", "confidence", "move_to", "move_to_name", "why"])
            for d in deliverables:
                v, n = verdicts[d["id"]], project_number(d["project_id"])
                t = v.get("target")
                w.writerow([d["id"], d.get("name"), d.get("type"), d["project_id"], names[n], v["verdict"], v.get("level", ""),
                            pid(t) if t else "", names[t] if t else "", v["reason"]])
        print(f"Review sheet written: {args.csv}")

    if not moving:
        return 0
    if not args.apply:
        print("Report only - nothing changed. Add --apply to move them.")
        return 0

    unlink = leave if args.unlink_work_items else []
    backup = save_backup("fix_shifted_deliverables", {
        "deliverables": [by_id[d["id"]] for d in moving], "work_items": follow, "work_items_unlinked": unlink,
    })
    print(f"Backup written: {backup}   (undo with --undo \"{backup}\")")

    now = datetime.now(timezone.utc).isoformat()
    logs = []
    for d in moving:
        v = verdicts[d["id"]]
        target = pid(v["target"])
        db.deliverables.update_one({"id": d["id"]}, {"$set": {"project_id": target, "updated_at": now}})
        logs.append({
            "id": str(uuid.uuid4()), "deliverable_id": d["id"], "action": "DELIVERABLE_MOVED",
            "old_value": {"project_id": d["project_id"]}, "new_value": {"project_id": target},
            "changed_by": CHANGED_BY, "changed_at": now,
            "metadata": {"reason": "import shifted deliverables onto the wrong project", "confidence": v["level"]},
        })
    db.deliverable_activity_log.insert_many(logs)
    for w in follow:
        target = projects[verdicts[w["deliverable_id"]]["target"]]
        db.work_items.update_one({"id": w["id"]}, {"$set": {"project_id": target["id"], "client_id": target.get("client_id")}})
    for w in unlink:
        db.work_items.update_one({"id": w["id"]}, {"$set": {"deliverable_id": ""}})
    print(f"Moved {len(moving)} deliverables and {len(follow)} work items; cleared the deliverable link on {len(unlink)} work items.")
    if leave and not unlink:
        print(f"{len(leave)} work items still point at a deliverable now in a different project - fix those by hand.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
