"""Project writes: create, edit, hide / unhide, reorder, bulk status.

    POST  /projects                         new project (+ optional deliverables)
    PATCH /projects/{id}
    POST  /projects/{id}/hide | /unhide     admin
    POST  /projects/bulk-hide | bulk-unhide
    POST  /projects/reorder                 move a card within / between status columns
    POST  /projects/bulk-status

Moved out of server.py unchanged. Deleting projects stays in server.py for now
(it shares the delete-ordering code with deliverables). Everything the routes
use from the application (models, helpers, the clock) is passed in.
"""
import re  # noqa: F401
import uuid  # noqa: F401
from datetime import datetime, timedelta, timezone  # noqa: F401
from typing import List, Optional  # noqa: F401

from fastapi import APIRouter, HTTPException, Request


def create_projects_write_router(
    db,
    now_iso,
    log_activity,
    require_admin,
    _hydrate_project,
    PROJECT_STATUSES,
    project_duplicates,
    _move_project_to_status,
    logger,
    BulkProjectIdsPayload,
    normalize_stages,
    _rollback_new_project,
    _projects_touched_since,
    _place_new_project_at_top,
    _persist_deliverable_batch,
    _notify_new_project_safely,
    _keyed_lock,
    _generate_unique_project_code,
    _fire_and_forget,
    _delete_approvals_for_deliverables,
    _build_deliverable_batch,
    User,
    ProjectUpdate,
    ProjectReorderPayload,
    ProjectCreate,
    Project,
    BulkProjectStatusPayload,
) -> APIRouter:
    router = APIRouter()

    @router.post("/projects")
    async def create_project(payload: ProjectCreate, request: Request):
        user = await require_admin(request)
        if payload.status and payload.status not in PROJECT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid project status")
        client_doc = await db.clients.find_one({"id": payload.client_id}, {"_id": 0})
        if not client_doc:
            raise HTTPException(status_code=400, detail="Client not found")

        # Validate that the selected POC belongs to this client
        if payload.poc_id:
            client_contacts = client_doc.get("contact_persons") or []
            if not any(c.get("id") == payload.poc_id for c in client_contacts):
                raise HTTPException(
                    status_code=400,
                    detail="Selected POC does not belong to this client"
                )

        ts = now_iso()
        code = await _generate_unique_project_code()
        project = Project(
            code=code,
            name=payload.name,
            client_id=payload.client_id,
            description=(payload.description or "").strip(),
            poc_id=payload.poc_id,
            start_date=payload.start_date or None,
            end_date=payload.end_date or None,
            status=payload.status or "Active",
            kanban_order=0,
            status_changed_at=ts,
            created_at=ts,
            updated_at=ts,
        )

        # Validate every deliverable and build every document up front, so a bad
        # stage or approval type is rejected BEFORE anything has been written
        # (previously the project row was already saved when a bad deliverable
        # failed part-way through the loop).
        specs = [
            {
                "name": d.name,
                "type": d.type,
                "start_dt": d.start_dt,
                "end_dt": d.end_dt,
                "stage_schedule": d.stage_schedule,
                "current_stage": d.current_stage,
                "required_stages": normalize_stages(d.required_stages),
                "approval_types": d.approval_types or [],
            }
            for d in payload.deliverables or []
        ]
        deliverable_docs, workflow_docs, item_docs, activity_docs = _build_deliverable_batch(
            project.id, specs, user.id, ts
        )

        # Pressing Create twice, or a client retrying a request that was slow to
        # answer, must not make two projects. The lock lines such requests up so the
        # second one finds the first and gets that project back instead.
        lock_key = f"create-project:{payload.client_id}:{project_duplicates.normalize_project_name(payload.name)}"
        async with _keyed_lock(lock_key):
            moment = datetime.now(timezone.utc)
            just_made = project_duplicates.find_double_submit(
                await _projects_touched_since(
                    payload.client_id,
                    moment - timedelta(seconds=project_duplicates.DOUBLE_SUBMIT_SECONDS),
                ),
                payload.client_id,
                payload.name,
                moment,
            )
            if just_made:
                already = await db.projects.find_one({"id": just_made["id"]}, {"_id": 0})
                if already:
                    return await _hydrate_project(already)

            await db.projects.insert_one(project.model_dump())
            try:
                # New projects always enter the top of their status column.
                await _place_new_project_at_top(project.id, project.status)
                await log_activity(
                    collection_name="project_activity_log",
                    entity_id=project.id,
                    entity_field="project_id",
                    action="PROJECT_CREATED",
                    changed_by=user.id,
                    new_value={
                        "code": project.code,
                        "name": project.name,
                        "client_id": project.client_id,
                        "poc_id": project.poc_id,
                        "start_date": project.start_date,
                        "end_date": project.end_date,
                        "status": project.status,
                    },
                )
                await _persist_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs)
            except Exception:
                # The project row is already saved. Leaving it behind would make the
                # person's retry create a second copy, so take it back out.
                logger.exception("Creating project %s failed part-way; rolling it back", project.id)
                await _rollback_new_project(project.id, deliverable_docs, workflow_docs, item_docs, activity_docs)
                raise HTTPException(
                    status_code=500,
                    detail="The project could not be saved. Nothing was created, please try again.",
                )

        # Notifying production staff needs one upsert per deliverable per person
        # and nothing in the response depends on it, so it runs after the response
        # is sent instead of making the admin wait for it.
        _fire_and_forget(
            _notify_new_project_safely(
                project.model_dump(),
                deliverable_docs,
                client_name=client_doc.get("name", ""),
            )
        )

        p = await db.projects.find_one({"id": project.id}, {"_id": 0})
        return await _hydrate_project(p)


    @router.patch("/projects/{project_id}")
    async def update_project(project_id: str, payload: ProjectUpdate, request: Request):
        user = await require_admin(request)
        existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")
        update_fields = payload.model_dump(exclude_unset=True)

        if "status" in update_fields and update_fields["status"] not in PROJECT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid project status")

        old_status = existing.get("status")
        new_status = update_fields.get("status")
        status_changed = "status" in update_fields and new_status != old_status

        # An explicit "No POC" must stick: without this flag the project would
        # fall back to the client's default contact and look unchanged.
        if "poc_id" in update_fields:
            update_fields["poc_none"] = not update_fields["poc_id"]

        # Validate POC against the project's client
        if "poc_id" in update_fields and update_fields["poc_id"]:
            client_id = update_fields.get("client_id", existing.get("client_id"))

            client_doc = await db.clients.find_one(
                {"id": client_id},
                {"_id": 0}
            )

            if not client_doc:
                raise HTTPException(
                    status_code=400,
                    detail="Client not found"
                )

            client_contacts = client_doc.get("contact_persons") or []

            if not any(
                c.get("id") == update_fields["poc_id"]
                for c in client_contacts
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Selected POC does not belong to this client"
                )

        # If the client changes without a new POC, clear the old POC
        if (
            "client_id" in update_fields
            and "poc_id" not in update_fields
            and update_fields["client_id"] != existing.get("client_id")
        ):
            update_fields["poc_id"] = None
            update_fields["poc_none"] = False

        update_fields["updated_at"] = now_iso()

        if status_changed:
            # Move status changes to the top of the destination column while
            # preserving all other edits made in the same request.
            update_fields.pop("status", None)
            await db.projects.update_one(
                {"id": project_id},
                {"$set": update_fields}
            )
            await _move_project_to_status(project_id, new_status, 0)
        else:
            await db.projects.update_one(
                {"id": project_id},
                {"$set": update_fields}
            )

        # Log actual project changes
        changed_fields = {
            key: value
            for key, value in update_fields.items()
            if key != "updated_at"
        }
        if status_changed:
            changed_fields["status"] = new_status

        old_value = {
            key: existing.get(key)
            for key in changed_fields
        }

        new_value = {
            key: changed_fields[key]
            for key in changed_fields
        }

        if changed_fields:
            await log_activity(
                collection_name="project_activity_log",
                entity_id=project_id,
                entity_field="project_id",
                action="PROJECT_UPDATED",
                changed_by=user.id,
                old_value=old_value,
                new_value=new_value,
            )

        p = await db.projects.find_one({"id": project_id}, {"_id": 0})
        return await _hydrate_project(p)


    @router.post("/projects/{project_id}/hide")
    async def hide_project(project_id: str, request: Request):
        user = await require_admin(request)

        existing = await db.projects.find_one(
            {"id": project_id},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

        await db.projects.update_one(
            {"id": project_id},
            {
                "$set": {
                    "hidden": True,
                    "hidden_at": now_iso(),
                    "hidden_by": user.id,
                    "updated_at": now_iso(),
                }
            }
        )

        await log_activity(
            collection_name="project_activity_log",
            entity_id=project_id,
            entity_field="project_id",
            action="PROJECT_HIDDEN",
            changed_by=user.id,
        )

        return {"success": True}


    @router.post("/projects/{project_id}/unhide")
    async def unhide_project(project_id: str, request: Request):
        user = await require_admin(request)

        existing = await db.projects.find_one(
            {"id": project_id},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Project not found"
            )

        await db.projects.update_one(
            {"id": project_id},
            {
                "$set": {
                    "hidden": False,
                    "hidden_at": None,
                    "hidden_by": None,
                    "updated_at": now_iso(),
                }
            }
        )

        await log_activity(
            collection_name="project_activity_log",
            entity_id=project_id,
            entity_field="project_id",
            action="PROJECT_UNHIDDEN",
            changed_by=user.id,
        )

        return {"success": True}


    @router.post("/projects/bulk-hide")
    async def bulk_hide_projects(payload: BulkProjectIdsPayload, request: Request):
        user = await require_admin(request)

        project_ids = payload.project_ids

        if not project_ids:
            raise HTTPException(
                status_code=400,
                detail="No projects selected"
            )

        await db.projects.update_many(
            {"id": {"$in": project_ids}},
            {
                "$set": {
                    "hidden": True,
                    "hidden_at": now_iso(),
                    "hidden_by": user.id,
                    "updated_at": now_iso(),
                }
            }
        )

        return {
            "success": True,
            "count": len(project_ids),
        }


    @router.post("/projects/bulk-unhide")
    async def bulk_unhide_projects(payload: BulkProjectIdsPayload, request: Request):
        user = await require_admin(request)

        project_ids = payload.project_ids

        if not project_ids:
            raise HTTPException(
                status_code=400,
                detail="No projects selected"
            )

        await db.projects.update_many(
            {"id": {"$in": project_ids}},
            {
                "$set": {
                    "hidden": False,
                    "hidden_at": None,
                    "hidden_by": None,
                    "updated_at": now_iso(),
                }
            }
        )

        return {
            "success": True,
            "count": len(project_ids),
        }


    @router.post("/projects/reorder")
    async def reorder_project(payload: ProjectReorderPayload, request: Request):
        user = await require_admin(request)

        if payload.target_status not in PROJECT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid project status")

        project = await db.projects.find_one(
            {"id": payload.project_id},
            {"_id": 0},
        )
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

        old_status = await _move_project_to_status(
            payload.project_id,
            payload.target_status,
            payload.target_index,
        )

        if old_status != payload.target_status:
            await log_activity(
                collection_name="project_activity_log",
                entity_id=payload.project_id,
                entity_field="project_id",
                action="PROJECT_STATUS_CHANGED",
                changed_by=user.id,
                old_value=old_status,
                new_value=payload.target_status,
            )
        else:
            await log_activity(
                collection_name="project_activity_log",
                entity_id=payload.project_id,
                entity_field="project_id",
                action="PROJECT_KANBAN_REORDERED",
                changed_by=user.id,
                new_value={
                    "status": payload.target_status,
                    "target_index": payload.target_index,
                },
            )

        updated = await db.projects.find_one(
            {"id": payload.project_id},
            {"_id": 0},
        )
        return await _hydrate_project(updated)


    @router.post("/projects/bulk-status")
    async def bulk_update_project_status(
        payload: BulkProjectStatusPayload,
        request: Request,
    ):
        user = await require_admin(request)

        project_ids = payload.project_ids
        new_status = payload.status

        if not project_ids:
            raise HTTPException(
                status_code=400,
                detail="No projects selected"
            )

        if new_status not in PROJECT_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Invalid project status"
            )

        projects = await db.projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0}
        ).to_list(len(project_ids))

        if not projects:
            raise HTTPException(
                status_code=404,
                detail="No projects found"
            )

        now = now_iso()

        # Preserve the selected order while moving the batch to the top of the
        # destination column. Each project is reindexed through the same helper
        # used by drag/drop and single-project status changes.
        for project_id in project_ids:
            await _move_project_to_status(project_id, new_status, 0)
            await db.projects.update_one(
                {"id": project_id},
                {"$set": {"updated_at": now}},
            )

        # Keep project activity history consistent with single-project updates.
        for project in projects:
            old_status = project.get("status")

            if old_status == new_status:
                continue

            await log_activity(
                collection_name="project_activity_log",
                entity_id=project["id"],
                entity_field="project_id",
                action="PROJECT_STATUS_CHANGED",
                changed_by=user.id,
                old_value=old_status,
                new_value=new_status,
            )

        return {
            "success": True,
            "count": len(projects),
            "status": new_status,
        }

    return router
