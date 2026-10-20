"""Project helpers: unique project codes, kanban ordering, moving a project between status columns, building and rolling back a batch of new deliverables.

Moved out of server.py unchanged (plain functions on the shared db handle).
"""
import logging
from datetime import datetime
from fastapi import HTTPException
from pymongo import UpdateOne
from typing import List
from typing import Optional

try:
    import projects_read
    from approval_helpers import _new_approval_item, _new_approval_workflow, _normalize_approval_types
    from common import now_iso
    from db_client import db
    from models import Deliverable
    from notifications import _notify_new_project
    from security import _activity_doc, gen_project_code
    from stage_rules import derive_deliverable_dates, normalize_stage_schedule
except ImportError:  # run as backend.server from the repo root
    from backend import projects_read
    from backend.approval_helpers import _new_approval_item, _new_approval_workflow, _normalize_approval_types
    from backend.common import now_iso
    from backend.db_client import db
    from backend.models import Deliverable
    from backend.notifications import _notify_new_project
    from backend.security import _activity_doc, gen_project_code
    from backend.stage_rules import derive_deliverable_dates, normalize_stage_schedule

logger = logging.getLogger("server")  # same log name as before the move


def _project_code_exists_query(code: str) -> dict:
    return {"code": code}


async def _generate_unique_project_code() -> str:
    for _ in range(10):
        code = gen_project_code()
        if not await db.projects.find_one(_project_code_exists_query(code), {"_id": 0}):
            return code
    return gen_project_code()


async def _reindex_project_status(status: str, ordered_ids: Optional[List[str]] = None):
    """Persist a contiguous Kanban order for one status column."""
    if ordered_ids is None:
        projects = await db.projects.find(
            {"status": status},
            {"_id": 0, "id": 1, "kanban_order": 1, "created_at": 1},
        ).sort([("kanban_order", 1), ("created_at", -1)]).to_list(5000)
        ordered_ids = [p["id"] for p in projects]

    if not ordered_ids:
        return

    await db.projects.bulk_write([
        UpdateOne(
            {"id": project_id, "status": status},
            {"$set": {"kanban_order": index}},
        )
        for index, project_id in enumerate(ordered_ids)
    ])


async def _place_new_project_at_top(project_id: str, status: str):
    """Put a just-created project (already inserted with kanban_order 0) at the
    top of its status column.

    _move_project_to_status does this by reading the whole column and then
    rewriting every project's kanban_order one update at a time - hundreds of
    writes, each a collection scan, on every single create. Shifting the other
    projects down by one gives the same order in one operation. Falls back to
    the full re-index if the shift cannot be applied."""
    try:
        # A pipeline update, so a missing or null kanban_order counts as 0
        # instead of making the whole shift fail part-way through.
        await db.projects.update_many(
            {"status": status, "id": {"$ne": project_id}},
            [{"$set": {"kanban_order": {"$add": [{"$ifNull": ["$kanban_order", 0]}, 1]}}}],
        )
    except Exception:
        logger.exception("Fast kanban shift failed; falling back to full re-index")
        await _move_project_to_status(project_id, status, 0)


async def _move_project_to_status(project_id: str, new_status: str, target_index: int = 0):
    project = await db.projects.find_one({"id": project_id}, {"_id": 0, "status": 1})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    old_status = project.get("status") or new_status

    statuses = [old_status] if old_status == new_status else [old_status, new_status]
    columns = {}

    for status in statuses:
        rows = await db.projects.find(
            {"status": status},
            {"_id": 0, "id": 1, "kanban_order": 1, "created_at": 1},
        ).sort([("kanban_order", 1), ("created_at", -1)]).to_list(5000)
        columns[status] = [row["id"] for row in rows if row.get("id") != project_id]

    if old_status != new_status:
        target_ids = columns[new_status]
        target_index = max(0, min(target_index, len(target_ids)))
        target_ids.insert(target_index, project_id)

        await db.projects.update_one(
            {"id": project_id},
            {
                "$set": {
                    "status": new_status,
                    "status_changed_at": now_iso(),
                    "kanban_order": target_index,
                    "updated_at": now_iso(),
                }
            },
        )

        await _reindex_project_status(old_status, columns[old_status])
        await _reindex_project_status(new_status, target_ids)
        return old_status

    ids = columns[old_status]
    target_index = max(0, min(target_index, len(ids)))
    ids.insert(target_index, project_id)
    await _reindex_project_status(old_status, ids)
    return old_status


async def _hydrate_projects(projects: list, include_deliverables: bool = True) -> list:
    return await projects_read.hydrate_projects(db, projects, include_deliverables)


async def _hydrate_project(p: dict) -> dict:
    return await projects_read.hydrate_project(db, p)


async def _projects_touched_since(client_id: Optional[str], since: datetime) -> list:
    return await projects_read.projects_touched_since(db, client_id, since)


def _build_deliverable_batch(project_id: str, specs: list, changed_by: str, ts: str):
    """Build every document needed to create a batch of deliverables, without
    touching the database. `specs` items carry: name, type, required_stages
    (already normalized), approval_types, and optionally stage_schedule
    (per-stage {start_dt, end_dt}), current_stage (defaults to the first
    stage), start_dt/end_dt (used only when stage_schedule is absent), and
    finished (skips straight to Completed with nothing pending - see the
    "finished" branch below). Raises HTTPException on a bad approval type, a
    bad stage schedule, or a current_stage outside the deliverable's own
    stages - before anything has been written."""
    deliverable_docs: list = []
    workflow_docs: list = []
    item_docs: list = []
    activity_docs: list = []
    for spec in specs:
        approval_types = spec.get("approval_types") or []
        normalized_types = _normalize_approval_types(approval_types)
        stages = spec["required_stages"]

        stage_schedule = normalize_stage_schedule(stages, spec.get("stage_schedule"))
        if stage_schedule:
            start_dt, end_dt = derive_deliverable_dates(stages, stage_schedule)
        else:
            # No per-stage windows: keep whatever plain overall dates the
            # caller supplied, unchanged (a deliverable can still exist with
            # no deadline tracking at all).
            start_dt, end_dt = spec.get("start_dt"), spec.get("end_dt")

        # A deliverable can be created already fully done (e.g. historical
        # data, or a project brought in from elsewhere) - it skips the normal
        # "Ready for Review" approval entirely, same end state as one that
        # was approved all the way through advance_deliverable_stage(). If no
        # explicit current_stage was given for it, it belongs at the LAST of
        # its own stages (it went all the way through), not the first.
        finished = bool(spec.get("finished"))
        current_stage = spec.get("current_stage") or (stages[-1] if finished else stages[0])
        if current_stage not in stages:
            raise HTTPException(
                status_code=400,
                detail=f'"{current_stage}" must be one of the deliverable\'s selected stages.',
            )

        stage_status = "Completed" if finished else "Ready for Review"

        deliv = Deliverable(
            project_id=project_id,
            name=spec["name"],
            type=spec.get("type") or "",
            start_dt=start_dt,
            end_dt=end_dt,
            stage_schedule=stage_schedule,
            required_stages=stages,
            current_stage=current_stage,
            stage_status=stage_status,
            approval_types=approval_types,
            created_at=ts,
            updated_at=ts,
        )
        db_doc = deliv.model_dump()
        db_doc.pop("approval_types", None)
        deliverable_docs.append(db_doc)

        # Manager approval always exists, even with no additional approval
        # types selected. (Same documents _create_or_sync_approval_workflow
        # would create one round trip at a time.) _new_approval_item already
        # creates NOT_STARTED items rather than PENDING ones whenever
        # stage_status isn't "Ready for Review", so a finished deliverable's
        # items come out inert automatically; the workflow's own status is
        # set to COMPLETED here to match what a naturally-finished deliverable
        # looks like (see _complete_approval_workflow).
        workflow = _new_approval_workflow(db_doc, normalized_types, ts)
        if finished:
            workflow["status"] = "COMPLETED"
            workflow["completed_at"] = ts
        workflow_docs.append(workflow)
        item_docs.extend(
            _new_approval_item(workflow["id"], db_doc, approval_type, ts)
            for approval_type in normalized_types
        )
        activity_docs.append(_activity_doc(
            deliv.id,
            "DELIVERABLE_CREATED",
            changed_by,
            new_value={
                "name": deliv.name,
                "type": deliv.type,
                "project_id": deliv.project_id,
                "required_stages": deliv.required_stages,
                "current_stage": deliv.current_stage,
                "stage_status": deliv.stage_status,
                "stage_schedule": deliv.stage_schedule,
            },
            entity_field="deliverable_id",
        ))
    return deliverable_docs, workflow_docs, item_docs, activity_docs


async def _persist_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs):
    """One insert per collection, however many deliverables there are."""
    if not deliverable_docs:
        return
    await db.deliverables.insert_many([dict(doc) for doc in deliverable_docs])
    await db.approval_workflows.insert_many(workflow_docs)
    await db.approval_items.insert_many(item_docs)
    await db.deliverable_activity_log.insert_many(activity_docs)


async def _rollback_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs):
    """Delete whatever part of a deliverable batch _persist_deliverable_batch got
    written before failing, so a retry starts from nothing. Every delete runs on
    its own: one failing must not stop the rest."""
    steps = [
        db.approval_items.delete_many({"id": {"$in": [d["id"] for d in item_docs]}}),
        db.approval_workflows.delete_many({"id": {"$in": [d["id"] for d in workflow_docs]}}),
        db.deliverable_activity_log.delete_many({"id": {"$in": [d["id"] for d in activity_docs]}}),
        db.deliverables.delete_many({"id": {"$in": [d["id"] for d in deliverable_docs]}}),
    ]
    for step in steps:
        try:
            await step
        except Exception:
            logger.exception("Rollback of a deliverable batch failed at one step")


async def _rollback_new_project(project_id, deliverable_docs, workflow_docs, item_docs, activity_docs):
    """Remove a project that create_project only half saved, with its batch."""
    await _rollback_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs)
    for step in (
        db.project_activity_log.delete_many({"project_id": project_id}),
        db.projects.delete_one({"id": project_id}),
    ):
        try:
            await step
        except Exception:
            logger.exception("Rollback of project %s failed at one step", project_id)


async def _notify_new_project_safely(project: dict, deliverables: list[dict], **kwargs):
    """Run _notify_new_project as a background task: it must never raise
    into the event loop, and a notification problem must not be able to fail
    a project that was already created."""
    try:
        await _notify_new_project(project, deliverables, **kwargs)
    except Exception:
        logger.exception("Could not send new-project notifications")
