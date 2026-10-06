"""Undo a batch of accidental approvals.

Every approval advances a deliverable one stage (Content -> Design -> Animate ->
Completed) and is logged in `approval_history`. This script finds the approvals
one person made in a time window and winds each deliverable back to where it was
before them: the earlier stage again "Ready for Review", its approval card
PENDING on the manager's board again, the "last reviewed" fields back to the
previous real review (or removed).

It does not guess. A deliverable is only changed when its current stage matches
what the logged approvals say it should be; anything else (earlier send-backs,
half-approved rounds, edited since) is listed under "left alone" for a manual
look. Approval history rows are kept (marked reverted=true, so a second run does
nothing). Work-sheet rows and project statuses are not touched.

Usage (backend folder, MONGO_URL and DB_NAME set):
    python scripts/undo_approvals.py                    # write it (saves a backup JSON first)
    python scripts/undo_approvals.py --dry-run          # shows the plan, writes nothing

Options:
    --user ID            who made the approvals     (default: admin-6e2cec)
    --since / --until    UTC window, ISO text       (default: 2026-10-06T12:00 .. 2026-10-06T13:00)
    --clear-notifications  also delete the unactioned "ready for <stage>" hand-off
                           notifications those approvals sent
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

from pymongo import MongoClient


def plan_restore(deliverable, workflow, accidental, prior):
    """Decide what to do for one deliverable. Returns ("restore", fields, info)
    or ("skip", reason)."""
    stages = deliverable.get("required_stages") or [deliverable.get("current_stage", "Content")]
    types = max(len((workflow or {}).get("required_types") or []), 1)

    if any(row.get("action") != "APPROVED" for row in prior):
        return ("skip", "had send-backs or other review actions before the window")
    if len(prior) % types or len(accidental) % types:
        return ("skip", "an approval round was only partly approved")

    before = len(prior) // types
    after = before + len(accidental) // types
    if before >= len(stages):
        return ("skip", "was already complete before the window")

    expected_stage = stages[min(after, len(stages) - 1)]
    expected_status = "Completed" if after >= len(stages) else "Ready for Review"
    if (deliverable.get("current_stage"), deliverable.get("stage_status")) != (expected_stage, expected_status):
        return (
            "skip",
            f"is now {deliverable.get('current_stage')} / {deliverable.get('stage_status')}, "
            f"not {expected_stage} / {expected_status} as the approvals imply (changed since?)",
        )

    fields = {"current_stage": stages[before], "stage_status": "Ready for Review"}
    last = prior[-1] if prior else None
    return (
        "restore",
        fields,
        {
            "from": f"{deliverable.get('current_stage')} / {deliverable.get('stage_status')}",
            "to": f"{stages[before]} / Ready for Review",
            "last_review": last,
            "workflow_status": "IN_PROGRESS" if before > 0 else "NOT_STARTED",
        },
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--user", default="admin-6e2cec")
    parser.add_argument("--since", default="2026-10-06T12:00")
    parser.add_argument("--until", default="2026-10-06T13:00")
    parser.add_argument("--dry-run", action="store_true", help="only show the plan")
    parser.add_argument("--clear-notifications", action="store_true")
    args = parser.parse_args()

    try:
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    except KeyError as missing:
        print(f"Set {missing.args[0]} first (see backend/.env.example).")
        return 1

    window = {"$gte": args.since, "$lt": args.until}
    rows = list(
        db.approval_history.find(
            {"action": "APPROVED", "performed_by": args.user, "created_at": window, "reverted": {"$ne": True}}
        )
    )
    by_deliverable = {}
    for row in rows:
        by_deliverable.setdefault(row["deliverable_id"], []).append(row)

    print(f"{len(rows)} approvals by {args.user} between {args.since} and {args.until}, "
          f"on {len(by_deliverable)} deliverables.\n")

    restores, skipped = [], []
    project_names = {}
    for deliverable_id, accidental in by_deliverable.items():
        deliverable = db.deliverables.find_one({"id": deliverable_id})
        if not deliverable:
            skipped.append((deliverable_id, "deliverable no longer exists"))
            continue
        workflow = db.approval_workflows.find_one({"deliverable_id": deliverable_id})
        first = min(row["created_at"] for row in accidental)
        prior = list(
            db.approval_history.find(
                {"deliverable_id": deliverable_id, "created_at": {"$lt": first}, "reverted": {"$ne": True}}
            ).sort("created_at", 1)
        )
        result = plan_restore(deliverable, workflow, accidental, prior)
        pid = deliverable.get("project_id")
        if pid not in project_names:
            project = db.projects.find_one({"id": pid}, {"name": 1}) or {}
            project_names[pid] = project.get("name", pid)
        label = f"{project_names[pid]} / {deliverable.get('name')}"
        if result[0] == "skip":
            skipped.append((label, result[1]))
        else:
            restores.append((deliverable, workflow, accidental, result[1], result[2], label))

    print(f"Will restore {len(restores)} deliverables:")
    for _, _, _, _, info, label in restores:
        print(f"  {label}\n      {info['from']}  ->  {info['to']}")
    print(f"\nLeft alone ({len(skipped)}) - check these by hand:")
    for label, reason in skipped:
        print(f"  {label}: {reason}")

    if not restores:
        return 0
    if args.dry_run:
        print("\nDry run - nothing written.")
        return 0

    # Backup first, so this can itself be undone.
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = f"undo_approvals_backup_{stamp}.json"
    backup = []
    for deliverable, workflow, accidental, _, _, _ in restores:
        items = list(db.approval_items.find({"approval_workflow_id": workflow["id"]})) if workflow else []
        backup.append({"deliverable": deliverable, "workflow": workflow, "items": items, "history_ids": [r["_id"] for r in accidental]})
    with open(backup_path, "w", encoding="utf-8") as handle:
        json.dump(backup, handle, default=str, indent=1)
    print(f"\nBackup written to {backup_path}")

    now = datetime.now(timezone.utc).isoformat()
    for deliverable, workflow, accidental, fields, info, _ in restores:
        update = {"$set": {**fields, "updated_at": now}}
        last = info["last_review"]
        if last:
            update["$set"].update(
                {
                    "last_review_action": "approved",
                    "last_reviewer_id": last.get("performed_by"),
                    "last_review_note": last.get("comment", ""),
                }
            )
        else:
            update["$unset"] = {"last_review_action": "", "last_reviewer_id": "", "last_review_note": ""}
        db.deliverables.update_one({"id": deliverable["id"]}, update)

        if workflow:
            db.approval_items.update_many(
                {"approval_workflow_id": workflow["id"]},
                {
                    "$set": {
                        "status": "PENDING",
                        "requested_at": now,
                        "approved_at": None,
                        "sent_back_at": None,
                        "approved_by": None,
                        "sent_back_by": None,
                        "comments": "",
                        "hidden": False,
                        "hidden_at": None,
                        "hidden_by": None,
                        "updated_at": now,
                    }
                },
            )
            db.approval_workflows.update_one(
                {"id": workflow["id"]},
                {"$set": {"status": info["workflow_status"], "updated_at": now, "completed_at": None}},
            )

        db.approval_history.update_many(
            {"_id": {"$in": [row["_id"] for row in accidental]}},
            {"$set": {"reverted": True, "reverted_at": now}},
        )

    if args.clear_notifications:
        removed = db.notifications.delete_many(
            {
                "type": "stage_handoff",
                "deliverable_id": {"$in": [d["id"] for d, *_ in restores]},
                "created_at": window,
                "actioned_at": None,
            }
        )
        print(f"Removed {removed.deleted_count} hand-off notifications.")

    print(f"Restored {len(restores)} deliverables.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
