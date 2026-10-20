"""Approval workflow helpers: creating and syncing a deliverable's approval workflow, who may act on an item, building queue rows, and the stage hand-off notice.

Moved out of server.py unchanged (plain functions on the shared db handle).
"""
import logging
import uuid
from fastapi import HTTPException
from typing import List
from typing import Optional

try:
    from common import now_iso
    from constants import APPROVAL_TYPES
    from db_client import db
    from domain_constants import ANY_MANAGER_APPROVAL_TYPES, DEPARTMENT_TO_STAGE
    from models import User
    from notifications import _upsert_notifications_batch
    from stage_rules import format_stage_window
except ImportError:  # run as backend.server from the repo root
    from backend.common import now_iso
    from backend.constants import APPROVAL_TYPES
    from backend.db_client import db
    from backend.domain_constants import ANY_MANAGER_APPROVAL_TYPES, DEPARTMENT_TO_STAGE
    from backend.models import User
    from backend.notifications import _upsert_notifications_batch
    from backend.stage_rules import format_stage_window

logger = logging.getLogger("server")  # same log name as before the move


async def _get_approval_workflow(deliverable_id: str):
    return await db.approval_workflows.find_one({"deliverable_id": deliverable_id}, {"_id": 0})


def _normalize_approval_types(approval_types: Optional[List[str]]) -> List[str]:
    """Manager approval is mandatory; any additional selected types are
    optional and run independently, not sequentially."""
    normalized = ["MANAGER"]
    for value in approval_types or []:
        value = str(value).upper().strip()
        if value not in APPROVAL_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid approval type: {value}")
        if value not in normalized:
            normalized.append(value)
    return normalized


def _new_approval_item(workflow_id: str, deliverable: dict, approval_type: str, ts: str) -> dict:
    ready = deliverable.get("stage_status") == "Ready for Review"
    return {"id": str(uuid.uuid4()), "approval_workflow_id": workflow_id, "deliverable_id": deliverable["id"], "approval_type": approval_type, "status": "PENDING" if ready else "NOT_STARTED", "assigned_to": None, "department": "Administration" if approval_type == "COMPLIANCE" else None, "requested_at": ts if ready else None, "approved_at": None, "sent_back_at": None, "approved_by": None, "sent_back_by": None, "comments": "", "hidden": False, "hidden_at": None, "hidden_by": None, "created_at": ts, "updated_at": ts}


def _new_approval_workflow(deliverable: dict, normalized: List[str], ts: str) -> dict:
    return {"id": str(uuid.uuid4()), "deliverable_id": deliverable["id"], "status": "NOT_STARTED", "required_types": normalized, "created_at": ts, "updated_at": ts}


async def _create_or_sync_approval_workflow(deliverable: dict, approval_types: List[str], changed_by: Optional[str] = None):
    normalized = _normalize_approval_types(approval_types)
    workflow = await _get_approval_workflow(deliverable["id"])
    ts = now_iso()
    # Manager approval is added for new workflows, but a manager may have
    # deliberately MOVED it to another queue (Leadership, Client SPOC...). The
    # move drops MANAGER from the workflow's required_types. Saving the
    # deliverable afterwards must not silently bring it back, or the card ends
    # up needing both approvals. Only respected when the caller did not ask for
    # MANAGER explicitly; if nothing else would remain, fall back to MANAGER.
    if workflow:
        explicitly_requested = {
            str(t).upper().strip() for t in (approval_types or [])
        }
        if (
            "MANAGER" not in (workflow.get("required_types") or [])
            and "MANAGER" not in explicitly_requested
        ):
            normalized = [t for t in normalized if t != "MANAGER"] or ["MANAGER"]
    if not normalized:
        if workflow:
            await db.approval_items.delete_many({"approval_workflow_id": workflow["id"]})
            await db.approval_workflows.delete_one({"id": workflow["id"]})
        return None
    if not workflow:
        workflow = _new_approval_workflow(deliverable, normalized, ts)
        await db.approval_workflows.insert_one(workflow)
    else:
        await db.approval_workflows.update_one({"id": workflow["id"]}, {"$set": {"required_types": normalized, "updated_at": ts}})
    existing = await db.approval_items.find({"approval_workflow_id": workflow["id"]}, {"_id": 0}).to_list(50)
    existing_types = {x.get("approval_type") for x in existing}
    for approval_type in normalized:
        if approval_type not in existing_types:
            await db.approval_items.insert_one(_new_approval_item(workflow["id"], deliverable, approval_type, ts))
    await db.approval_items.delete_many({"approval_workflow_id": workflow["id"], "approval_type": {"$nin": normalized}})
    return await _get_approval_workflow(deliverable["id"])


async def _set_approval_items_pending(deliverable_id: str):
    workflow = await _get_approval_workflow(deliverable_id)
    if not workflow:
        return
    ts = now_iso()
    # A new review round must always be visible. `hidden` is a per-round
    # flag: a card the previous stage's reviewer hid must not stay hidden
    # for the next stage's reviewer, or it never shows on their board.
    await db.approval_items.update_many({"approval_workflow_id": workflow["id"]}, {"$set": {"status": "PENDING", "requested_at": ts, "approved_at": None, "sent_back_at": None, "approved_by": None, "sent_back_by": None, "comments": "", "hidden": False, "hidden_at": None, "hidden_by": None, "updated_at": ts}})
    await db.approval_workflows.update_one({"id": workflow["id"]}, {"$set": {"status": "IN_PROGRESS", "updated_at": ts, "completed_at": None}})


async def _complete_approval_workflow(deliverable_id: str):
    """The deliverable has no stage left to review: park every approval item
    and mark the workflow COMPLETED."""
    workflow = await _get_approval_workflow(deliverable_id)
    if not workflow:
        return
    ts = now_iso()
    await db.approval_items.update_many(
        {"approval_workflow_id": workflow["id"]},
        {
            "$set": {
                "status": "NOT_STARTED",
                "requested_at": None,
                "approved_at": None,
                "sent_back_at": None,
                "approved_by": None,
                "sent_back_by": None,
                "comments": "",
                "updated_at": ts,
            }
        },
    )
    await db.approval_workflows.update_one(
        {"id": workflow["id"]},
        {"$set": {"status": "COMPLETED", "completed_at": ts, "updated_at": ts}},
    )


async def _delete_approvals_for_deliverables(deliverable_ids: list[str]):
    """Deleting a deliverable must also remove its approval workflow/items
    and the notifications that point at it; otherwise they linger on the
    Approvals board (shown with no name) and inflate its badge count. The
    approval_history audit trail is intentionally kept."""
    if not deliverable_ids:
        return
    await db.approval_items.delete_many({"deliverable_id": {"$in": deliverable_ids}})
    await db.approval_workflows.delete_many({"deliverable_id": {"$in": deliverable_ids}})
    await db.notifications.delete_many({"deliverable_id": {"$in": deliverable_ids}})


# Approval queues that every manager can see and act on (MANAGER stays scoped
# to the manager whose department owns the deliverable's current stage).


async def _approval_item_can_act(user: User, item: dict, deliverable: dict) -> bool:
    # Admins can act on any approval item. Members are view-only, and
    # managers are scoped by the rules below.
    if user.role == "admin":
        return True
    if user.role != "manager":
        return False

    # Explicitly assigned approvals belong only to the assigned user.
    if item.get("assigned_to"):
        return item.get("assigned_to") == user.id

    approval_type = item.get("approval_type")

    if approval_type == "MANAGER":
        if user.role != "manager":
            return False

        # Manager approvals are scoped to the current production stage.
        stage_to_department = {
            "Content": "Content",
            "Design": "Design",
            "Animate": "Animation",
        }

        required_department = stage_to_department.get(
            deliverable.get("current_stage")
        )

        return required_department == user.department

    # Leadership, Client SPOC and Compliance are not tied to a production
    # stage. Managers are the ones who move cards into these queues, and
    # admins can't approve, so any manager may see and act on them.
    if approval_type in ANY_MANAGER_APPROVAL_TYPES:
        return True

    return False


async def _hydrate_approval_items(items: list[dict]) -> list[dict]:
    if not items:
        return []

    deliverable_ids = list({
        x.get("deliverable_id")
        for x in items
        if x.get("deliverable_id")
    })

    deliverables = {
        d["id"]: d
        for d in await db.deliverables.find(
            {"id": {"$in": deliverable_ids}},
            {"_id": 0},
        ).to_list(len(deliverable_ids) or 1)
    }

    project_ids = list({
        d.get("project_id")
        for d in deliverables.values()
        if d.get("project_id")
    })

    projects = {
        p["id"]: p
        for p in await db.projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0},
        ).to_list(len(project_ids) or 1)
    }

    user_ids = list({
        uid
        for uid in (
            [x.get("assigned_to") for x in items]
        )
        if uid
    })

    users = {
        u["id"]: u
        for u in await db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0},
        ).to_list(len(user_ids) or 1)
    }

    client_ids = list({
        p.get("client_id")
        for p in projects.values()
        if p.get("client_id")
    })

    clients = {
        c["id"]: c
        for c in await db.clients.find(
            {"id": {"$in": client_ids}},
            {"_id": 0},
        ).to_list(len(client_ids) or 1)
    }

    result = []

    for item in items:
        d = deliverables.get(item.get("deliverable_id"), {})
        p = projects.get(d.get("project_id"), {})
        assigned = users.get(item.get("assigned_to"), {})
        client = clients.get(p.get("client_id"), {})

        result.append({
            **item,
            "_deliverable": d,
            "deliverable_name": d.get("name", ""),
            "deliverable_type": d.get("type", ""),
            "current_stage": d.get("current_stage", "Content"),
            "stage_status": d.get("stage_status", "Not Started"),
            "required_stages": d.get(
                "required_stages", [d.get("current_stage", "Content")]
            ),
            # Deadline of the stage currently under review (falls back to the
            # deliverable's overall end date for old-style deliverables).
            "due_date": (
                ((d.get("stage_schedule") or {}).get(d.get("current_stage")) or {}).get("end_dt")
                or d.get("end_dt")
            ),
            "assigned_to_name": assigned.get("name", "Unassigned"),
            "project_name": p.get("name", ""),
            "project_code": p.get("code", ""),
            "client_name": client.get("name", ""),
        })

    return result


async def _notify_stage_handoff(deliverable: dict, stage: str, ts: str):
    """Tell the next stage's managers that a deliverable has just reached them.

    Managers of that department get an "open Approvals" notice (the approval
    card is already waiting on their board). Team members get nothing: this is
    an approval notice and they cannot act on approvals. One notice per
    manager per hand-off - the key includes the hand-off timestamp so a
    deliverable that is sent back and approved again notifies them again.
    """
    departments = [
        department
        for department, dept_stage in DEPARTMENT_TO_STAGE.items()
        if dept_stage == stage
    ]
    if not departments:
        return

    recipients = await db.users.find(
        {
            "active": {"$ne": False},
            "role": "manager",
            "department": {"$in": departments},
        },
        {"_id": 0, "id": 1, "role": 1},
    ).to_list(1000)
    if not recipients:
        return

    project = await db.projects.find_one(
        {"id": deliverable.get("project_id")},
        {"_id": 0, "id": 1, "name": 1, "client_id": 1},
    ) or {}

    label = f'{project.get("name", "Project")} · {deliverable.get("name", "Deliverable")}'
    window_text = format_stage_window((deliverable.get("stage_schedule") or {}).get(stage))
    due_note = f" Due {window_text}." if window_text else ""

    notifications = []
    for recipient in recipients:
        notifications.append({
            "id": str(uuid.uuid4()),
            "user_id": recipient["id"],
            "type": "stage_handoff",
            "title": f"{stage} approval ready",
            "message": f"{label} has moved to {stage} and is waiting in Approvals.{due_note}",
            "project_id": deliverable.get("project_id"),
            "deliverable_id": deliverable.get("id"),
            "client_id": project.get("client_id"),
            "stage": stage,
            "action_type": "open_approvals",
            "created_at": ts,
            "read_at": None,
            "actioned_at": None,
            "dedupe_key": f'stage-handoff:{deliverable.get("id")}:{stage}:{ts}:{recipient["id"]}',
        })

    await _upsert_notifications_batch(notifications)


async def _notify_stage_handoff_safe(deliverable: dict, stage: str, ts: str):
    # A notification problem must never fail the approval itself.
    try:
        await _notify_stage_handoff(deliverable, stage, ts)
    except Exception:
        logger.exception("Could not send stage hand-off notifications")
