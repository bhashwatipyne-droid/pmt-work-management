"""Deleting projects, and the deliverable routes.

    POST   /projects/bulk-delete
    DELETE /projects/{id}
    GET    /deliverables
    POST   /deliverables
    POST   /projects/{id}/deliverables/import     spreadsheet upload
    PATCH  /deliverables/{id}
    DELETE /deliverables/{id}

Moved out of server.py unchanged. _delete_project_and_children keeps its
ordering: Work Sheet rows are detached and stamped first, the project is
removed last, so a failed delete can be retried (there are no transactions).
Models, helpers and notifiers are passed in.
"""
import contextlib  # noqa: F401
from typing import List, Optional  # noqa: F401

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile  # noqa: F401


def create_deliverables_router(
    db,
    get_acting_user,
    require_admin,
    log_activity,
    logger,
    deliverable_import,
    Deliverable,
    now_iso,
    normalize_stages,
    normalize_stage_schedule,
    derive_deliverable_dates,
    _set_approval_items_pending,
    _delete_approvals_for_deliverables,
    _create_or_sync_approval_workflow,
    reconcile_stage_after_edit,
    _rollback_deliverable_batch,
    _persist_deliverable_batch,
    _notify_stage_handoff,
    _notify_new_project_safely,
    _notify_new_project,
    _keyed_lock,
    _get_approval_workflow,
    _fire_and_forget,
    _complete_approval_workflow,
    _build_deliverable_batch,
    User,
    STAGE_STATUSES,
    STAGES,
    DELIVERABLE_TYPES,
    BulkProjectIdsPayload,
    APPROVAL_TYPES,
    DeliverableUpdate,
    DeliverableCreate,
) -> APIRouter:
    router = APIRouter()

    async def _delete_project_and_children(existing: dict, user: User) -> None:
        """Delete one project, its deliverables and their approvals, keeping every
        historical work entry.

        Order matters because Mongo has no transaction here: each step leaves the
        data in a state that a second delete attempt can finish.
          1. Work entries are detached AND stamped with the project's id, code and
             name in one write, so the link is never lost even if a later step
             fails (and the project is still there to retry).
          2. Deliverables and their approvals go next.
          3. The project document goes last, so a half-finished delete is still
             visible in the app instead of leaving orphans nobody can find."""
        project_id = existing["id"]

        await db.work_items.update_many(
            {"project_id": project_id},
            {
                "$set": {
                    "deleted_project_id": project_id,
                    "deleted_project_code": existing.get("code"),
                    "deleted_project_name": existing.get("name"),
                    "project_id": None,
                    "deliverable_id": None,
                }
            },
        )

        deliverable_ids = [
            d["id"]
            for d in await db.deliverables.find(
                {"project_id": project_id}, {"_id": 0, "id": 1}
            ).to_list(None)
        ]

        await db.deliverables.delete_many({"project_id": project_id})
        await _delete_approvals_for_deliverables(deliverable_ids)
        await db.projects.delete_one({"id": project_id})

        await log_activity(
            collection_name="project_activity_log",
            entity_id=project_id,
            entity_field="project_id",
            action="PROJECT_DELETED",
            changed_by=user.id,
            old_value={
                "code": existing.get("code"),
                "name": existing.get("name"),
                "client_id": existing.get("client_id"),
                "start_date": existing.get("start_date"),
                "end_date": existing.get("end_date"),
                "status": existing.get("status"),
            },
        )


    @router.post("/projects/bulk-delete")
    async def bulk_delete_projects(payload: BulkProjectIdsPayload, request: Request):
        user = await require_admin(request)

        project_ids = payload.project_ids

        if not project_ids:
            raise HTTPException(
                status_code=400,
                detail="No projects selected"
            )

        projects = await db.projects.find(
            {"id": {"$in": project_ids}}, {"_id": 0}
        ).to_list(None)

        for existing in projects:
            await _delete_project_and_children(existing, user)

        return {
            "success": True,
            "count": len(project_ids),
        }


    @router.delete("/projects/{project_id}")
    async def delete_project(project_id: str, request: Request):
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

        await _delete_project_and_children(existing, user)

        return {"success": True}


    @router.get("/deliverables", response_model=List[Deliverable])
    async def list_deliverables(
        request: Request,
        project_id: Optional[str] = None,
    ):
        await get_acting_user(request)
        query = {"project_id": project_id} if project_id else {}
        deliverables = await db.deliverables.find(query, {"_id": 0}).sort("created_at", 1).to_list(None)
        ids = [d["id"] for d in deliverables]
        workflows = await db.approval_workflows.find({"deliverable_id": {"$in": ids}}, {"_id": 0, "deliverable_id": 1, "required_types": 1}).to_list(None) if ids else []
        by_id = {w["deliverable_id"]: w.get("required_types", []) for w in workflows}
        for d in deliverables:
            d["approval_types"] = by_id.get(d["id"], [])
        return deliverables


    @router.post("/deliverables", response_model=Deliverable)
    async def create_deliverable(payload: DeliverableCreate, request: Request):
        user = await require_admin(request)
        project_doc = await db.projects.find_one({"id": payload.project_id}, {"_id": 0})
        if not project_doc:
            raise HTTPException(status_code=400, detail="Project not found")
        ts = now_iso()
        stages = normalize_stages(payload.required_stages)
        approval_types = payload.approval_types or []
        stage_schedule = normalize_stage_schedule(stages, payload.stage_schedule)
        if stage_schedule:
            start_dt, end_dt = derive_deliverable_dates(stages, stage_schedule)
        else:
            start_dt, end_dt = payload.start_dt, payload.end_dt
        current_stage = payload.current_stage or stages[0]
        if current_stage not in stages:
            raise HTTPException(
                status_code=400,
                detail=f'"{current_stage}" must be one of the deliverable\'s selected stages.',
            )
        d = Deliverable(
            created_at=ts,
            updated_at=ts,
            project_id=payload.project_id,
            name=payload.name,
            type=payload.type or "",
            start_dt=start_dt,
            end_dt=end_dt,
            stage_schedule=stage_schedule,
            required_stages=stages,
            current_stage=current_stage,
            stage_status="Ready for Review",
            approval_types=approval_types,
        )
        db_doc = d.model_dump()
        db_doc.pop("approval_types", None)
        await db.deliverables.insert_one(db_doc)
        # Manager approval always exists, even with no additional approval
        # types selected, so this must run unconditionally.
        await _create_or_sync_approval_workflow({**db_doc, "approval_types": approval_types}, approval_types, user.id)
        await log_activity(
            collection_name="deliverable_activity_log",
            entity_id=d.id,
            entity_field="deliverable_id",
            action="DELIVERABLE_CREATED",
            changed_by=user.id,
            new_value={
                "name": d.name,
                "type": d.type,
                "project_id": d.project_id,
                "required_stages": d.required_stages,
                "current_stage": d.current_stage,
                "stage_status": d.stage_status,
            },
        )

        # Adding a deliverable to an existing project must alert the production
        # staff for its stages, exactly like creating a project with deliverables.
        # A notification problem must never fail the deliverable creation itself.
        try:
            await _notify_new_project(project_doc, [db_doc], title="New deliverable added")
        except Exception:
            logger.exception("Could not send new-deliverable notifications")

        return d


    @router.post("/projects/{project_id}/deliverables/import")
    async def import_deliverables(
        project_id: str,
        request: Request,
        file: UploadFile = File(...),
        dry_run: bool = Form(True),
    ):
        """Bulk-create deliverables in a project from a .csv / .xlsx sheet (admin only).

        dry_run=true only reads and checks the file and returns a row-by-row report;
        dry_run=false creates every row that checked out as "ok" and skips the rest."""
        user = await require_admin(request)
        project_doc = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project_doc:
            raise HTTPException(status_code=404, detail="Project not found")

        content = await file.read(deliverable_import.MAX_FILE_BYTES + 1)
        try:
            table = deliverable_import.read_table(file.filename or "", content)
        except deliverable_import.ImportFileError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

        # Uploading the same sheet twice is meant to skip every row the second time,
        # because validate_table drops rows already in the project. That only works if
        # the second upload reads the project AFTER the first has finished writing, so
        # a real import holds this project's lock from reading what exists until the
        # rows are saved (two clicks on Import, or a retry, would otherwise both see
        # an empty project and each create every row). A dry run writes nothing.
        guard = contextlib.nullcontext() if dry_run else _keyed_lock(f"import-deliverables:{project_id}")
        async with guard:
            try:
                existing_docs = await db.deliverables.find(
                    {"project_id": project_id}, {"_id": 0, "name": 1, "type": 1}
                ).to_list(None)
                existing = {
                    ((d.get("name") or "").strip().lower(), (d.get("type") or "").strip().lower())
                    for d in existing_docs
                }
                report = deliverable_import.validate_table(
                    table, DELIVERABLE_TYPES, STAGES, APPROVAL_TYPES, existing
                )
            except deliverable_import.ImportFileError as exc:
                raise HTTPException(status_code=400, detail=str(exc))

            if dry_run:
                return {**report, "dry_run": True, "created": 0}

            ready = [row for row in report["rows"] if row["status"] == "ok"]
            if not ready:
                raise HTTPException(status_code=400, detail="There are no valid rows to import.")

            ts = now_iso()
            specs = [
                {
                    "name": row["name"],
                    "type": row["type"],
                    "stage_schedule": row["stage_schedule"],
                    "current_stage": row["current_stage"],
                    "finished": row["finished"],
                    "required_stages": normalize_stages(row["required_stages"]),
                    "approval_types": row["approval_types"],
                }
                for row in ready
            ]
            deliverable_docs, workflow_docs, item_docs, activity_docs = _build_deliverable_batch(
                project_id, specs, user.id, ts
            )
            try:
                await _persist_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs)
            except Exception:
                # insert_many can stop part-way. Clear what it wrote so the retry
                # imports the whole file instead of skipping the rows that got in.
                logger.exception("Importing deliverables into %s failed part-way; rolling back", project_id)
                await _rollback_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs)
                raise HTTPException(
                    status_code=500,
                    detail="The deliverables could not be saved. Nothing was imported, please try again.",
                )

        # Alerting production staff needs one upsert per deliverable per person and
        # nothing in the response depends on it, so it runs after the response.
        _fire_and_forget(
            _notify_new_project_safely(project_doc, deliverable_docs, title="New deliverable added")
        )

        return {**report, "dry_run": False, "created": len(deliverable_docs)}


    @router.patch("/deliverables/{deliverable_id}", response_model=Deliverable)
    async def update_deliverable(deliverable_id: str, payload: DeliverableUpdate, request: Request):
        user = await require_admin(request)
        existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        update_fields = payload.model_dump(exclude_unset=True)
        approval_types = update_fields.pop("approval_types", None)
        if "required_stages" in update_fields:
            update_fields["required_stages"] = normalize_stages(
                update_fields["required_stages"]
            )
        if "stage_status" in update_fields and update_fields["stage_status"] not in STAGE_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid stage status")

        old_stage = existing.get("current_stage")
        old_stage_status = existing.get("stage_status")
        old_schedule = existing.get("stage_schedule") or {}

        # The stages a schedule/derived-dates recompute should use: the new list
        # if one was sent, otherwise the deliverable's current one.
        effective_stages = update_fields.get(
            "required_stages", existing.get("required_stages") or [old_stage]
        )

        if "stage_schedule" in update_fields:
            # A schedule was explicitly sent: validate it and re-derive the
            # overall dates from it (start_dt/end_dt are never accepted directly
            # once a schedule exists - see the Deliverable model).
            update_fields["stage_schedule"] = normalize_stage_schedule(
                effective_stages, update_fields["stage_schedule"]
            )
            update_fields["start_dt"], update_fields["end_dt"] = derive_deliverable_dates(
                effective_stages, update_fields["stage_schedule"]
            )
        elif "required_stages" in update_fields and old_schedule:
            # Stages changed but no explicit schedule was sent: drop any window
            # for a stage that is no longer selected (its dates are no longer
            # meaningful) and re-derive the overall dates from what's left.
            cleaned = normalize_stage_schedule(effective_stages, old_schedule)
            if cleaned != old_schedule:
                update_fields["stage_schedule"] = cleaned
            update_fields["start_dt"], update_fields["end_dt"] = derive_deliverable_dates(
                effective_stages, cleaned
            )

        # Editing the production stages must also re-place the deliverable in its
        # new pipeline (see reconcile_stage_after_edit). This runs on every save
        # that includes the stage list - which is what the edit modal always
        # sends - so a deliverable already left inconsistent by an earlier edit
        # is repaired simply by opening it and pressing Save.
        stage_move = None
        if (
            "required_stages" in update_fields
            and "current_stage" not in update_fields
            and "stage_status" not in update_fields
        ):
            stage_move = reconcile_stage_after_edit(
                old_stage,
                old_stage_status,
                update_fields["required_stages"],
            )
            if stage_move:
                update_fields.update(stage_move)

        update_fields["updated_at"] = now_iso()
        await db.deliverables.update_one({"id": deliverable_id}, {"$set": update_fields})

        updated_for_workflow = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if approval_types is not None:
            await _create_or_sync_approval_workflow(updated_for_workflow, approval_types, user.id)
        if stage_move and stage_move["stage_status"] == "Ready for Review":
            # Moved to a (new) stage: open a fresh review round for it, even if
            # the status text was already "Ready for Review" for the old stage.
            await _set_approval_items_pending(deliverable_id)
            try:
                await _notify_stage_handoff(
                    updated_for_workflow, stage_move["current_stage"], update_fields["updated_at"]
                )
            except Exception:
                logger.exception("Could not send stage hand-off notifications")
        elif stage_move and stage_move["stage_status"] == "Completed":
            await _complete_approval_workflow(deliverable_id)
        elif update_fields.get("stage_status") == "Ready for Review" and existing.get("stage_status") != "Ready for Review":
            await _set_approval_items_pending(deliverable_id)

        await log_activity(
            collection_name="deliverable_activity_log",
            entity_id=deliverable_id,
            entity_field="deliverable_id",
            action="DELIVERABLE_UPDATED",
            changed_by=user.id,
            old_value={
                key: existing.get(key)
                for key in update_fields
                if key != "updated_at"
            },
            new_value={
                key: update_fields.get(key)
                for key in update_fields
                if key != "updated_at"
            },
        )

        # Stage changed
        if "current_stage" in update_fields and update_fields["current_stage"] != old_stage:
            await log_activity(
                collection_name="deliverable_activity_log",
                entity_id=deliverable_id,
                entity_field="deliverable_id",
                action="DELIVERABLE_STAGE_CHANGED",
                changed_by=user.id,
                old_value=old_stage,
                new_value=update_fields["current_stage"],
            )

        # Stage status changed
        if "stage_status" in update_fields and update_fields["stage_status"] != old_stage_status:
            await log_activity(
                collection_name="deliverable_activity_log",
                entity_id=deliverable_id,
                entity_field="deliverable_id",
                action="DELIVERABLE_STATUS_CHANGED",
                changed_by=user.id,
                old_value=old_stage_status,
                new_value=update_fields["stage_status"],
            )

            # Changes Requested = rework
            if update_fields["stage_status"] == "Changes Requested":
                await log_activity(
                    collection_name="deliverable_activity_log",
                    entity_id=deliverable_id,
                    entity_field="deliverable_id",
                    action="DELIVERABLE_REWORKED",
                    changed_by=user.id,
                    old_value=old_stage_status,
                    new_value="Changes Requested",
                )

        updated = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        workflow = await _get_approval_workflow(deliverable_id)
        updated["approval_types"] = workflow.get("required_types", []) if workflow else []
        return updated


    @router.delete("/deliverables/{deliverable_id}")
    async def delete_deliverable(
        deliverable_id: str,
        request: Request
    ):
        user = await require_admin(request)

        existing = await db.deliverables.find_one(
            {"id": deliverable_id},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Deliverable not found"
            )

        # Preserve historical work entries.
        # Only remove their relationship to this deliverable.
        await db.work_items.update_many(
            {"deliverable_id": deliverable_id},
            {
                "$set": {
                    "deliverable_id": None
                }
            },
        )

        await db.deliverables.delete_one(
            {"id": deliverable_id}
        )
        await _delete_approvals_for_deliverables([deliverable_id])

        await log_activity(
            collection_name="deliverable_activity_log",
            entity_id=deliverable_id,
            entity_field="deliverable_id",
            action="DELIVERABLE_DELETED",
            changed_by=user.id,
            old_value=existing,
        )

        return {"success": True}

    return router
