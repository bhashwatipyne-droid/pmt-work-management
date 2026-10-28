"""Work Sheet routes: list, review, edit, bulk create / update / delete,
split into unit rows, history, and tagging teammates (collaborators).

    GET    /work-items, /work-items/pending-count, /work-items/history
    POST   /work-items/{id}/review
    PATCH  /work-items/{id}
    POST   /work-items/bulk-create | /bulk-update | /bulk-delete | /collaborators
    POST   /work-items/{id}/expand-units
    DELETE /work-items/{id}

Moved out of server.py unchanged. Creating a single row (POST /work-items) and
the helpers behind it stay in server.py because the WhatsApp planning hand-off
and the background jobs create rows through the same code; the row rules live
in work_items_rules.py. Registration order inside this module is kept so the
fixed paths are matched before /work-items/{id}.
"""
import re  # noqa: F401
import time  # noqa: F401
import uuid  # noqa: F401
from datetime import datetime, timezone  # noqa: F401
from typing import Dict, List, Optional  # noqa: F401

from fastapi import APIRouter, HTTPException, Query, Request  # noqa: F401
from pydantic import BaseModel  # noqa: F401
from pymongo import UpdateOne  # noqa: F401
from pymongo.errors import DuplicateKeyError  # noqa: F401


class ExpandUnitsPayload(BaseModel):
    count: int


def unit_row_name(deliverable_type: str, unit: str, index: int) -> str:
    """"Presentation (PPT) - Per Slide" -> "Presentation (PPT) - Slide 3"."""
    base = re.sub(r"\s+-\s+Per\s+\w+$", "", deliverable_type).strip()
    return f"{base} - {unit} {index}"


class CollaboratorsPayload(BaseModel):
    ids: List[str]
    creator_ids: List[str]


def create_work_items_router(
    db,
    logger,
    get_acting_user,
    log_activity,
    now_iso,
    WorkItem,
    WorkItemUpdate,
    WorkItemCreate,
    BulkUpdatePayload,
    BulkDeletePayload,
    BulkCreatePayload,
    scoped_update_fields,
    get_user_department,
    get_user_role,
    collab_fingerprint,
    collab_key,
    collab_row_has_identity,
    COLLAB_MAX_ROWS,
    COLLAB_MAX_PEOPLE,
    COLLAB_NO_IDENTITY_MESSAGE,
    cached_read,
    apply_time_rules,
    _notify_admins_deliverable_missing,
    _lookup_cache,
    MAX_UNIT_ROWS,
    DEPARTMENT_TO_STAGE,
    validate_work_date,
    validate_deliverable_ids,
    search_clauses,
    is_multi_deliverable_row,
    get_time_benchmark,
    can_user_create_stage,
    apply_quantity_rules,
    _upsert_notifications_batch,
    _clean_ids,
    UNIT_ROWS_DEPARTMENT,
    DONE_STATUSES,
    DELIVERABLE_TYPE_UNITS,
) -> APIRouter:
    router = APIRouter()

    async def _content_rows_with_real_creator():
        """Mongo clause that hides Content-stage work items whose creator is
        missing OR points at a user that no longer exists (both render as
        "Unassigned" on the Work Sheet). Other stages are untouched."""
        async def load_user_ids():
            return [
                u["id"] async for u in db.users.find({}, {"_id": 0, "id": 1}) if u.get("id")
            ]

        # Polled by every open tab (the sidebar badge) and used by every Work Sheet
        # load, while the user list almost never changes.
        user_ids = await cached_read("user-ids", load_user_ids, ttl=60)
        return {
            "$or": [
                {"stage": {"$ne": "Content"}},
                {"creator_id": {"$in": user_ids}},
            ]
        }


    @router.get("/work-items/pending-count")
    async def work_items_pending_count(request: Request):
        """Lightweight count for the sidebar's Work Sheet badge: items not yet
        Closed. Scoped to the user's own production stage the same way the
        worksheet already scopes what a member/manager can add rows for
        (DEPARTMENT_TO_STAGE) — admins, who have sheet-wide view-only access,
        see the total across every stage."""
        user = await get_acting_user(request)

        stage = None if user.role == "admin" else DEPARTMENT_TO_STAGE.get(user.department)

        async def compute():
            query = {
                "status": {"$nin": list(DONE_STATUSES)},
                # Unassigned Content rows are hidden from the sheet, so don't count them.
                **(await _content_rows_with_real_creator()),
            }
            if stage:
                query["stage"] = stage
            return {"count": await db.work_items.count_documents(query)}

        # The answer depends only on the stage, so everyone in a team shares one.
        return await cached_read(f"wi-pending:{stage or 'all'}", compute)


    @router.get("/work-items", response_model=List[WorkItem])
    async def list_work_items(
        request: Request,
        status: Optional[List[str]] = Query(default=None),
        stage: Optional[List[str]] = Query(default=None),
        deliverable_type: Optional[List[str]] = Query(default=None),
        work_category: Optional[List[str]] = Query(default=None),
        month: Optional[str] = None,
        search: Optional[str] = None,

        creator_id: Optional[List[str]] = Query(default=None),
        reviewer_id: Optional[List[str]] = Query(default=None),
        project_id: Optional[List[str]] = Query(default=None),
        deliverable_id: Optional[List[str]] = Query(default=None),

        date_from: Optional[str] = None,
        date_to: Optional[str] = None,

        # Optional — lets a caller ask for just the first N (newest-first,
        # matching the existing sort) instead of the full set. Every existing
        # caller that doesn't pass this keeps getting everything (up to 5000,
        # same as before), so this is purely additive.
        limit: Optional[int] = Query(default=None, ge=1, le=5000),

        # Work Sheet only: skip Content-stage rows that have no creator (they show
        # as "Unassigned" and number in the thousands). Opt-in so the project work
        # log and other callers still see every row.
        hide_unassigned_content: bool = False,
    ):
        await get_acting_user(request)

        query = {}

        # Multi-select filters
        if creator_id:
            query["creator_id"] = {"$in": creator_id}

        if reviewer_id:
            query["reviewer_id"] = {"$in": reviewer_id}

        if status:
            query["status"] = {"$in": status}

        if stage:
            query["stage"] = {"$in": stage}

        if deliverable_type:
            query["deliverable_type"] = {"$in": deliverable_type}

        if work_category:
            query["work_category"] = {"$in": work_category}

        if project_id:
            query["project_id"] = {"$in": project_id}

        if deliverable_id:
            # A Campaign Ideation Plan row also belongs to every deliverable ticked on it.
            query.setdefault("$and", []).append(
                {"$or": [{"deliverable_id": {"$in": deliverable_id}}, {"deliverable_ids": {"$in": deliverable_id}}]}
            )

        # Date range
        if date_from or date_to:
            date_query = {}

            if date_from:
                date_query["$gte"] = date_from

            if date_to:
                date_query["$lte"] = date_to

            query["work_date"] = date_query

        # Existing month filter
        if month:
            query["month"] = month

        if hide_unassigned_content:
            # $and (not a top-level $or) so it can't collide with the search $or below.
            query.setdefault("$and", []).append(await _content_rows_with_real_creator())

        # Existing search. Escaped so typing "(" or "[" in the search box (or the
        # command palette, which reuses this) matches literally instead of
        # producing an invalid regular expression and a 500.
        if search:
            query.setdefault("$and", []).extend(
                search_clauses(search, ["deliverable_name", "remarks"])
            )

        # Ask the database for exactly `limit` rows (or the 5000 cap) in ONE batch.
        # to_list(n) alone does not do that: it does not send a limit to the server,
        # and MongoDB's first batch is only 101 documents, so the rest arrives via
        # follow-up getMore calls - each another round trip to the database - and
        # the last one hands over everything that is left (thousands of rows), which
        # is then thrown away when only the first 300 were wanted.
        row_cap = limit or 5000
        started = time.perf_counter()
        items = (
            await db.work_items
            .find(query, {"_id": 0})
            .sort([("work_date", -1), ("created_at", -1)])
            .limit(row_cap)
            .batch_size(row_cap)
            .to_list(row_cap)
        )
        query_ms = (time.perf_counter() - started) * 1000
        if query_ms > 500:
            logger.warning(
                "SLOW work-items query: %.0fms for %d rows (limit=%s)",
                query_ms, len(items), limit,
            )

        return items


    @router.post("/work-items/{item_id}/review", response_model=WorkItem)
    async def review_work_item(
        item_id: str,
        action: str,
        request: Request,
        note: str = "",
    ):
        user = await get_acting_user(request)

        # Managers - and admins, whom members often name as the reviewer - review
        # the work items assigned to them.
        if user.role not in ("manager", "admin"):
            raise HTTPException(
                status_code=403,
                detail="Only a manager or admin can review work items",
            )

        if action not in ("approve", "request_changes"):
            raise HTTPException(
                status_code=400,
                detail="Invalid review action",
            )

        existing = await db.work_items.find_one(
            {"id": item_id},
            {"_id": 0},
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Work item not found",
            )

        if existing.get("status") != "Ready for Review":
            raise HTTPException(
                status_code=400,
                detail="Work item is not ready for review",
            )

        if existing.get("reviewer_id") != user.id:
            raise HTTPException(
                status_code=403,
                detail="This work item is not assigned to you",
            )

        old_status = existing.get("status")

        new_status = (
            "Closed"
            if action == "approve"
            else "Changes Requested"
        )

        # Update work item status. The filter repeats the checks above so a second
        # reviewer (or the auto-close job) acting at the same moment cannot also
        # succeed: only the request that still finds the row waiting wins.
        result = await db.work_items.update_one(
            {"id": item_id, "status": "Ready for Review", "reviewer_id": user.id},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": now_iso(),
                }
            },
        )
        if result.matched_count == 0:
            raise HTTPException(
                status_code=409,
                detail="This work item was just changed by someone else. Reload and try again.",
            )

        # Log review action + note
        review_action = (
            "WORK_ITEM_APPROVED"
            if action == "approve"
            else "WORK_ITEM_REWORKED"
        )

        await log_activity(
            collection_name="work_item_activity_log",
            entity_id=item_id,
            entity_field="work_item_id",
            action=review_action,
            changed_by=user.id,
            old_value=old_status,
            new_value=new_status,
            metadata={
                "review_note": note.strip() if note else "",
            },
        )

        updated = await db.work_items.find_one(
            {"id": item_id},
            {"_id": 0},
        )

        return updated


    # Work a manager was asked to review that they never got round to is approved
    # for them after this long (0 turns it off). The clock is the row's last update,
    # the same moment the Bulk Review list shows as "waiting since".


    @router.patch("/work-items/{item_id}", response_model=WorkItem)
    async def update_work_item(item_id: str, payload: WorkItemUpdate, request: Request):
        user = await get_acting_user(request)

        existing = await db.work_items.find_one({"id": item_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Work item not found")

        creator_department = await get_user_department(existing.get("creator_id"))
        creator_role = await get_user_role(existing.get("creator_id"))

        update_fields = await scoped_update_fields(
            user,
            existing,
            payload.model_dump(exclude_unset=True),
            creator_department,
            creator_role,
        )

        # Keep the old values before updating MongoDB
        old_status = existing.get("status")
        old_stage = existing.get("stage")
        was_not_available = bool(existing.get("deliverable_not_available"))

        update_fields["updated_at"] = now_iso()

        await db.work_items.update_one(
            {"id": item_id},
            {"$set": update_fields},
        )

        # Log status changes
        if "status" in update_fields and update_fields["status"] != old_status:
            await log_activity(
                collection_name="work_item_activity_log",
                entity_id=item_id,
                entity_field="work_item_id",
                action="WORK_ITEM_STATUS_CHANGED",
                changed_by=user.id,
                old_value=old_status,
                new_value=update_fields["status"],
            )

            # A Changes Requested status is specifically a rework event
            if update_fields["status"] == "Changes Requested":
                await log_activity(
                    collection_name="work_item_activity_log",
                    entity_id=item_id,
                    entity_field="work_item_id",
                    action="WORK_ITEM_REWORKED",
                    changed_by=user.id,
                    old_value=old_status,
                    new_value="Changes Requested",
                )

        # Log stage changes
        if "stage" in update_fields and update_fields["stage"] != old_stage:
            await log_activity(
                collection_name="work_item_activity_log",
                entity_id=item_id,
                entity_field="work_item_id",
                action="WORK_ITEM_STAGE_CHANGED",
                changed_by=user.id,
                old_value=old_stage,
                new_value=update_fields["stage"],
            )

        updated = await db.work_items.find_one(
            {"id": item_id},
            {"_id": 0},
        )

        # Only the moment "Not available" is chosen notifies the admins, not every
        # later edit of a row that already has it.
        if updated and updated.get("deliverable_not_available") and not was_not_available:
            await _notify_admins_deliverable_missing(user, updated)

        return updated


    @router.post("/work-items/bulk-create", response_model=List[WorkItem])
    async def bulk_create_work_items(payload: BulkCreatePayload, request: Request):
        user = await get_acting_user(request)
        if user.role == "admin":
            raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
        if payload.count < 1 or payload.count > 500:
            raise HTTPException(status_code=400, detail="count must be between 1 and 500")

        requested_stage = payload.template.stage if payload.template else None

        if not requested_stage:
            raise HTTPException(
                status_code=400,
                detail="A stage is required when creating work items",
            )

        if not can_user_create_stage(user, requested_stage):
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to add rows to this stage",
            )

        tpl = (payload.template or WorkItemCreate()).model_dump()

        if tpl.get("client_id"):
            client = await db.clients.find_one({"id": tpl["client_id"]}, {"_id": 0, "id": 1})
            if not client:
                raise HTTPException(status_code=400, detail="Invalid client")

        if tpl.get("project_id"):
            project = await db.projects.find_one(
                {"id": tpl["project_id"]},
                {"_id": 0, "client_id": 1},
            )
            if not project:
                raise HTTPException(status_code=400, detail="Invalid project")
            if tpl.get("client_id") and tpl["client_id"] != project.get("client_id"):
                raise HTTPException(status_code=400, detail="Project does not belong to selected client")
            tpl["client_id"] = project.get("client_id")

        await validate_deliverable_ids(tpl)

        work_date = tpl.pop("work_date", None) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        validate_work_date(work_date)
        month = work_date[:7]
        apply_quantity_rules({}, tpl)
        await apply_time_rules(user, {}, tpl, creator_id=user.id)
        docs = []
        for _ in range(payload.count):
            data = dict(tpl)
            if user.role == "member":
                data["creator_id"] = user.id
                data["reviewer_id"] = None
                data["manager_id"] = None
            else:
                # Same as adding a single row: the manager who adds the rows owns
                # them until they pick a creator. Leaving creator_id empty (as
                # this used to) made every row show "Unassigned" and uneditable
                # for the manager - a manager may only edit rows whose creator is
                # in their own department - and a Content row with no creator is
                # also hidden from the sheet. An explicitly supplied creator_id
                # (assigning the batch to a specific person) is still honored.
                data["creator_id"] = data.get("creator_id") or user.id
            ts = now_iso()
            item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
            docs.append(item.model_dump())
        if docs:
            await db.work_items.insert_many(docs)
        return docs


    @router.post("/work-items/{item_id}/expand-units")
    async def expand_work_item_units(item_id: str, payload: ExpandUnitsPayload, request: Request):
        """Turn a row whose type is measured in units (slides, reels, pages) into
        `count` rows, one per unit, in a single insert. The row itself becomes the
        first unit when it has no name yet; otherwise every unit is a new row. The
        new rows share the row's client / project / deliverable / stage / people."""
        user = await get_acting_user(request)
        if user.role == "admin":
            raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
        # Per-unit rows are a Design team feature (members and managers).
        if user.department != UNIT_ROWS_DEPARTMENT:
            raise HTTPException(status_code=403, detail="Adding rows per unit is only available to the Design team")

        existing = await db.work_items.find_one({"id": item_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Work item not found")

        deliverable_type = existing.get("deliverable_type") or ""
        unit = DELIVERABLE_TYPE_UNITS.get(deliverable_type)
        if not unit:
            raise HTTPException(status_code=400, detail="This deliverable type is not measured in units")
        if payload.count < 1 or payload.count > MAX_UNIT_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"Number of rows must be between 1 and {MAX_UNIT_ROWS}",
            )

        # Same permission as editing the row.
        await scoped_update_fields(
            user,
            existing,
            {},
            await get_user_department(existing.get("creator_id")),
            await get_user_role(existing.get("creator_id")),
        )

        work_date = existing.get("work_date") or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        base = {
            key: existing.get(key)
            for key in (
                "client_id", "project_id", "deliverable_id", "stage",
                "creator_id", "reviewer_id", "manager_id", "work_category",
            )
        }
        base["deliverable_not_available"] = bool(existing.get("deliverable_not_available"))
        base["deliverable_type"] = deliverable_type
        base["status"] = "Not Started"
        base["version"] = existing.get("version") or ""

        # Each unit starts with the person's own benchmark time, like picking the
        # type on a single row.
        time_fields = {"deliverable_type": deliverable_type}
        await apply_time_rules(user, {}, time_fields, creator_id=base.get("creator_id"))
        base.update({k: v for k, v in time_fields.items() if k != "deliverable_type"})

        first_is_source = not (existing.get("deliverable_name") or "").strip()
        updated = []
        if first_is_source:
            source_update = {
                "deliverable_name": unit_row_name(deliverable_type, unit, 1),
                "updated_at": now_iso(),
            }
            await db.work_items.update_one({"id": item_id}, {"$set": source_update})
            updated.append({**existing, **source_update})

        ts = now_iso()
        docs = []
        for index in range(2 if first_is_source else 1, payload.count + 1):
            item = WorkItem(
                work_date=work_date,
                month=work_date[:7],
                created_at=ts,
                updated_at=ts,
                deliverable_name=unit_row_name(deliverable_type, unit, index),
                **base,
            )
            docs.append(item.model_dump())
        if docs:
            await db.work_items.insert_many(docs)

        return {"updated": updated, "created": [{k: v for k, v in d.items() if k != "_id"} for d in docs]}


    async def _build_collab_copy(
        source: dict, person_id: str, group_id: str, added_by: str, ts: str
    ) -> dict:
        """The collaborator's own row for `source`. What was done is copied; what
        the person spent (time, quantity), their status and remarks start fresh.
        Time is pre-filled from THEIR benchmark for the type, like adding a row."""
        deliverable_type = source.get("deliverable_type") or ""
        benchmark = (
            await get_time_benchmark([person_id], deliverable_type)
            if deliverable_type
            else None
        )
        is_animate = source.get("stage") == "Animate"
        # A Campaign Ideation Plan row covers the same deliverables; the time for
        # each starts fresh, like the rest of what the person spent.
        deliverable_ids = (
            _clean_ids(source.get("deliverable_ids")) if is_multi_deliverable_row(source) else []
        )
        units = max(1, len(deliverable_ids))
        if benchmark:
            benchmark = round(benchmark * units, 2)
        item = WorkItem(
            work_date=source["work_date"],
            month=source.get("month") or source["work_date"][:7],
            deliverable_name=source.get("deliverable_name") or "",
            deliverable_type=deliverable_type,
            deliverable_link=source.get("deliverable_link") or "",
            work_category=source.get("work_category") or "Core",
            version=source.get("version") or "",
            time_taken_minutes=benchmark or 0,
            time_source="auto" if benchmark else "manual",
            time_benchmark_minutes=benchmark,
            video_duration_seconds=source.get("video_duration_seconds") if is_animate else None,
            video_duration_minutes=source.get("video_duration_minutes") if is_animate else None,
            quantity=float(units),
            deliverable_ids=deliverable_ids,
            creator_id=person_id,
            reviewer_id=source.get("reviewer_id"),
            manager_id=source.get("manager_id"),
            client_id=source.get("client_id"),
            project_id=source.get("project_id"),
            deliverable_id=source.get("deliverable_id"),
            deliverable_not_available=bool(source.get("deliverable_not_available")),
            stage=source.get("stage"),
            remarks="",
            status="Not Started",
            collab_group_id=group_id,
            collab_source_id=source["id"],
            collab_added_by=added_by,
            created_at=ts,
            updated_at=ts,
        )
        doc = item.model_dump()
        doc["collab_key"] = collab_key(person_id, source)
        return doc


    async def _notify_collaborators(actor_name: str, created_by_person: Dict[str, list]):
        """One notice per tagged person per request. Never raises: the rows are
        already saved, so a notification problem must not fail the request."""
        try:
            ts = now_iso()
            notifications = []
            for person_id, rows in created_by_person.items():
                first = rows[0]
                count = len(rows)
                what = (first.get("deliverable_name") or first.get("deliverable_type") or "an entry")
                message = (
                    f"{actor_name} added you as a collaborator on {what}. "
                    "It is in your Work Sheet - add your time."
                    if count == 1
                    else f"{actor_name} added you as a collaborator on {count} entries. "
                    "They are in your Work Sheet - add your time."
                )
                notifications.append({
                    "id": str(uuid.uuid4()),
                    "user_id": person_id,
                    "type": "collaborator_added",
                    "title": "You were added to an entry",
                    "message": message,
                    "project_id": first.get("project_id"),
                    "deliverable_id": first.get("deliverable_id"),
                    "deliverable_name": first.get("deliverable_name") or "",
                    "client_id": first.get("client_id"),
                    "stage": first.get("stage"),
                    "action_type": "open_worksheet",
                    "created_at": ts,
                    "read_at": None,
                    "actioned_at": None,
                    "dedupe_key": f"collaborator-added:{uuid.uuid4()}",
                })
            await _upsert_notifications_batch(notifications)
        except Exception:
            logger.exception("Could not create the collaborator notifications")


    @router.post("/work-items/collaborators")
    async def add_work_item_collaborators(payload: CollaboratorsPayload, request: Request):
        user = await get_acting_user(request)
        if user.role == "admin":
            raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")

        ids = list(dict.fromkeys(i for i in payload.ids if i))
        people = list(dict.fromkeys(i for i in payload.creator_ids if i))
        if not ids or not people:
            raise HTTPException(status_code=400, detail="Pick at least one entry and one person.")
        if len(ids) > COLLAB_MAX_ROWS:
            raise HTTPException(status_code=400, detail=f"Pick at most {COLLAB_MAX_ROWS} entries at a time.")
        if len(people) > COLLAB_MAX_PEOPLE:
            raise HTTPException(status_code=400, detail=f"Pick at most {COLLAB_MAX_PEOPLE} people at a time.")

        sources = await db.work_items.find({"id": {"$in": ids}}, {"_id": 0}).to_list(len(ids))
        sources_by_id = {s["id"]: s for s in sources}

        target_docs = await db.users.find(
            {"id": {"$in": people}},
            {"_id": 0, "id": 1, "name": 1, "role": 1, "department": 1, "active": 1},
        ).to_list(len(people))
        targets_by_id = {t["id"]: t for t in target_docs}

        owner_ids = list({s.get("creator_id") for s in sources if s.get("creator_id")})
        owners_by_id = {}
        if owner_ids:
            owner_docs = await db.users.find(
                {"id": {"$in": owner_ids}}, {"_id": 0, "id": 1, "department": 1, "role": 1}
            ).to_list(len(owner_ids))
            owners_by_id = {d["id"]: d for d in owner_docs}

        # What the tagged people already have on the days in play, in one query -
        # checked in memory below so a big selection is not one lookup per pair.
        dates = list({s.get("work_date") for s in sources if s.get("work_date")})
        groups = list({s.get("collab_group_id") for s in sources if s.get("collab_group_id")})
        clauses = [{"creator_id": {"$in": people}, "work_date": {"$in": dates}}]
        if groups:
            clauses.append({"creator_id": {"$in": people}, "collab_group_id": {"$in": groups}})
        existing_rows = await db.work_items.find(
            {"$or": clauses},
            {
                "_id": 0, "creator_id": 1, "collab_group_id": 1, "work_date": 1, "stage": 1,
                "project_id": 1, "deliverable_id": 1, "deliverable_not_available": 1,
                "deliverable_name": 1, "deliverable_type": 1, "version": 1,
            },
        ).to_list(None)
        have_entry = {(r.get("creator_id"), collab_fingerprint(r)) for r in existing_rows}
        have_group = {
            (r.get("creator_id"), r["collab_group_id"])
            for r in existing_rows
            if r.get("collab_group_id")
        }

        _lookup_cache.set({})  # share benchmark lookups across this request

        created: list = []
        skipped: list = []
        row_errors: list = []
        touched_sources: list = []
        created_by_person: Dict[str, list] = {}

        for source_id in ids:
            source = sources_by_id.get(source_id)
            if not source:
                row_errors.append({"id": source_id, "reason": "Entry not found."})
                continue

            # Same permission as editing the entry: its creator, or a manager of
            # that creator's department. Admins and everyone else are refused.
            owner = owners_by_id.get(source.get("creator_id")) or {}
            try:
                await scoped_update_fields(
                    user, source, {}, owner.get("department"), owner.get("role")
                )
            except HTTPException as exc:
                row_errors.append({"id": source_id, "reason": exc.detail})
                continue

            if not collab_row_has_identity(source):
                row_errors.append({"id": source_id, "reason": COLLAB_NO_IDENTITY_MESSAGE})
                continue

            fingerprint = collab_fingerprint(source)
            group_id = source.get("collab_group_id")
            made_any = False

            for person_id in people:
                person = targets_by_id.get(person_id)
                reason = None
                if person_id == source.get("creator_id"):
                    reason = "owner"
                elif not person or person.get("active") is False or person.get("role") == "admin":
                    reason = "not_available"
                elif source.get("stage") and DEPARTMENT_TO_STAGE.get(person.get("department")) != source.get("stage"):
                    # A member can only edit rows of their own department's stage.
                    reason = "different_stage"
                elif (person_id, fingerprint) in have_entry or (
                    group_id and (person_id, group_id) in have_group
                ):
                    reason = "already_has_entry"

                if reason:
                    skipped.append({"id": source_id, "creator_id": person_id, "reason": reason})
                    continue

                if not group_id:
                    # Claim the group on the entry first, atomically, so two
                    # requests tagging the same entry end up in ONE group.
                    candidate = str(uuid.uuid4())
                    await db.work_items.update_one(
                        {"id": source_id, "collab_group_id": None},
                        {"$set": {"collab_group_id": candidate, "updated_at": now_iso()}},
                    )
                    fresh = await db.work_items.find_one(
                        {"id": source_id}, {"_id": 0, "collab_group_id": 1}
                    )
                    group_id = (fresh or {}).get("collab_group_id") or candidate

                doc = await _build_collab_copy(source, person_id, group_id, user.id, now_iso())
                try:
                    await db.work_items.insert_one(doc)
                except DuplicateKeyError:
                    # Lost a race with an identical request: the row exists.
                    have_entry.add((person_id, fingerprint))
                    skipped.append({"id": source_id, "creator_id": person_id, "reason": "already_has_entry"})
                    continue

                have_entry.add((person_id, fingerprint))
                have_group.add((person_id, group_id))
                made_any = True
                row = {k: v for k, v in doc.items() if k not in ("_id", "collab_key")}
                created.append(row)
                created_by_person.setdefault(person_id, []).append(row)

                try:
                    await log_activity(
                        collection_name="work_item_activity_log",
                        entity_id=row["id"],
                        entity_field="work_item_id",
                        action="WORK_ITEM_COLLABORATOR_ADDED",
                        changed_by=user.id,
                        metadata={"source_id": source_id, "group_id": group_id},
                    )
                except Exception:
                    logger.exception("Could not log the collaborator activity")

            if made_any:
                touched_sources.append(source_id)

        updated_sources = []
        if touched_sources:
            updated_sources = await db.work_items.find(
                {"id": {"$in": touched_sources}}, {"_id": 0, "collab_key": 0}
            ).to_list(len(touched_sources))

        if created_by_person:
            await _notify_collaborators(user.name, created_by_person)

        return {
            "created": created,
            "updated_sources": updated_sources,
            "skipped": skipped,
            "row_errors": row_errors,
        }


    @router.post("/work-items/bulk-update", response_model=List[WorkItem])
    async def bulk_update_work_items(payload: BulkUpdatePayload, request: Request):
        user = await get_acting_user(request)

        if not payload.ids:
            return []

        raw_fields = payload.patch.model_dump(exclude_unset=True)

        if not raw_fields:
            return []

        # Fetch all requested items in one query.
        existing_items = await db.work_items.find(
            {"id": {"$in": payload.ids}},
            {"_id": 0},
        ).to_list(len(payload.ids))

        existing_by_id = {item["id"]: item for item in existing_items}

        # Every creator's department and role in ONE query. These used to be two
        # awaited queries per selected row, one after another.
        creator_ids = list({
            item.get("creator_id") for item in existing_items if item.get("creator_id")
        })
        creators_by_id = {}
        if creator_ids:
            creator_docs = await db.users.find(
                {"id": {"$in": creator_ids}},
                {"_id": 0, "id": 1, "department": 1, "role": 1},
            ).to_list(len(creator_ids))
            creators_by_id = {doc["id"]: doc for doc in creator_docs}

        # Share benchmark / client / project lookups across the rows of this request.
        _lookup_cache.set({})

        operations = []
        activity_logs = []

        for item_id in payload.ids:
            existing = existing_by_id.get(item_id)

            # Keep the same tolerant behavior as the existing bulk endpoint:
            # skip missing / unauthorized rows rather than failing the whole operation.
            if not existing:
                continue

            creator_doc = creators_by_id.get(existing.get("creator_id")) or {}
            creator_department = creator_doc.get("department")
            creator_role = creator_doc.get("role")

            try:
                update_fields = await scoped_update_fields(
                    user,
                    existing,
                    dict(raw_fields),
                    creator_department,
                    creator_role,
                )
            except HTTPException:
                continue

            if not update_fields:
                continue

            old_status = existing.get("status")
            old_stage = existing.get("stage")

            update_fields["updated_at"] = now_iso()

            operations.append(
                UpdateOne(
                    {"id": item_id},
                    {"$set": update_fields},
                )
            )

            if (
                "status" in update_fields
                and update_fields["status"] != old_status
            ):
                activity_logs.append({
                    "id": str(uuid.uuid4()),
                    "work_item_id": item_id,
                    "action": "WORK_ITEM_STATUS_CHANGED",
                    "old_value": old_status,
                    "new_value": update_fields["status"],
                    "changed_by": user.id,
                    "changed_at": now_iso(),
                    "metadata": {},
                })

                if update_fields["status"] == "Changes Requested":
                    activity_logs.append({
                        "id": str(uuid.uuid4()),
                        "work_item_id": item_id,
                        "action": "WORK_ITEM_REWORKED",
                        "old_value": old_status,
                        "new_value": "Changes Requested",
                        "changed_by": user.id,
                        "changed_at": now_iso(),
                        "metadata": {},
                    })

            if (
                "stage" in update_fields
                and update_fields["stage"] != old_stage
            ):
                activity_logs.append({
                    "id": str(uuid.uuid4()),
                    "work_item_id": item_id,
                    "action": "WORK_ITEM_STAGE_CHANGED",
                    "old_value": old_stage,
                    "new_value": update_fields["stage"],
                    "changed_by": user.id,
                    "changed_at": now_iso(),
                    "metadata": {},
                })

        if not operations:
            return []

        # ONE MongoDB bulk write.
        await db.work_items.bulk_write(operations)

        # ONE activity-log bulk insert instead of one insert per row.
        if activity_logs:
            await db.work_item_activity_log.insert_many(activity_logs)

        # ONE query to return all updated rows.
        updated_items = await db.work_items.find(
            {"id": {"$in": [op._filter["id"] for op in operations]}},
            {"_id": 0},
        ).to_list(len(operations))

        # Preserve the order requested by the frontend.
        updated_by_id = {item["id"]: item for item in updated_items}

        # Rows that just became "Not available": one notice per project is enough
        # (the notification itself is also de-duplicated per project).
        newly_not_available: dict = {}
        for item_id in payload.ids:
            row = updated_by_id.get(item_id)
            if (
                row
                and row.get("deliverable_not_available")
                and not existing_by_id.get(item_id, {}).get("deliverable_not_available")
            ):
                newly_not_available.setdefault(row.get("project_id"), row)

        for row in newly_not_available.values():
            await _notify_admins_deliverable_missing(user, row)

        return [
            updated_by_id[item_id]
            for item_id in payload.ids
            if item_id in updated_by_id
        ]


    @router.get("/work-items/history")
    async def get_work_items_history(
        request: Request,
        stage: Optional[str] = None,
    ):
        await get_acting_user(request)

        # Master = all work-item history.
        # Other sheets = history for work items currently in that stage.
        work_item_query = {}

        if stage and stage != "Master":
            work_item_query["stage"] = stage

        # Get the work items that belong to this sheet.
        work_items = await db.work_items.find(
            work_item_query,
            {
                "_id": 0,
                "id": 1,
                "deliverable_name": 1,
                "stage": 1,
            },
        ).to_list(5000)

        if not work_items:
            return []

        work_item_ids = [item["id"] for item in work_items]

        work_item_map = {
            item["id"]: item
            for item in work_items
        }

        # Get activity logs for those work items.
        logs = await db.work_item_activity_log.find(
            {
                "work_item_id": {
                    "$in": work_item_ids,
                }
            },
            {"_id": 0},
        ).sort(
            "changed_at",
            -1,
        ).to_list(5000)

        # Resolve user names so frontend doesn't need to make
        # a separate request for every history entry.
        user_ids = list({
            log.get("changed_by")
            for log in logs
            if log.get("changed_by")
        })

        users = await db.users.find(
            {"id": {"$in": user_ids}},
            {
                "_id": 0,
                "id": 1,
                "name": 1,
            },
        ).to_list(1000)

        user_map = {
            user["id"]: user["name"]
            for user in users
        }

        history = []

        for log in logs:
            work_item = work_item_map.get(
                log.get("work_item_id"),
                {},
            )

            history.append({
                **log,
                "changed_by_name": user_map.get(
                    log.get("changed_by"),
                    "Unknown user",
                ),
                "work_item_name": work_item.get(
                    "deliverable_name",
                    "",
                ),
            })

        return history


    @router.post("/work-items/bulk-delete")
    async def bulk_delete_work_items(
        payload: BulkDeletePayload,
        request: Request
    ):
        user = await get_acting_user(request)

        if not payload.ids:
            return {"deleted_count": 0}

        items = await db.work_items.find(
            {"id": {"$in": payload.ids}},
            {"_id": 0}
        ).to_list(None)

        allowed_ids = []

        for item in items:
            if user.role == "admin":
                # Admins may delete any row.
                allowed_ids.append(item["id"])
                continue

            if user.role == "member":
                if item.get("creator_id") == user.id:
                    allowed_ids.append(item["id"])
                continue

            if user.role == "manager":
                creator_department = await get_user_department(
                    item.get("creator_id")
                )

                if creator_department == user.department:
                    allowed_ids.append(item["id"])

        if len(allowed_ids) != len(payload.ids):
            raise HTTPException(
                status_code=403,
                detail="You can only delete work items you are allowed to edit"
            )

        result = await db.work_items.delete_many(
            {"id": {"$in": allowed_ids}}
        )

        return {"deleted_count": result.deleted_count}


    @router.delete("/work-items/{item_id}")
    async def delete_work_item(item_id: str, request: Request):
        user = await get_acting_user(request)

        existing = await db.work_items.find_one(
            {"id": item_id},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="Work item not found"
            )

        # Members can only delete their own entries.
        if user.role == "member":
            if existing.get("creator_id") != user.id:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete your own work items"
                )

        # Managers can delete entries logged by their department.
        elif user.role == "manager":
            creator_department = await get_user_department(
                existing.get("creator_id")
            )

            if creator_department != user.department:
                raise HTTPException(
                    status_code=403,
                    detail="You can only delete work items logged by your own department"
                )

        result = await db.work_items.delete_one(
            {"id": item_id}
        )

        if result.deleted_count == 0:
            raise HTTPException(
                status_code=404,
                detail="Work item not found"
            )

        await log_activity(
            collection_name="work_item_activity_log",
            entity_id=item_id,
            entity_field="work_item_id",
            action="WORK_ITEM_DELETED",
            changed_by=user.id,
            old_value=existing,
        )

        return {"success": True}

    return router
