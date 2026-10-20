"""Notification routes: the bell list, mark read, push-token registration, and turning a notice into a Work Sheet row.

Moved out of server.py unchanged; everything the routes use from the
application is passed to create_notification_router().
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from fastapi import HTTPException, Request, Response
from pymongo.errors import DuplicateKeyError
from fastapi import APIRouter
from pydantic import BaseModel, Field


class PushTokenPayload(BaseModel):
    token: str = Field(..., min_length=20, max_length=4096)
    platform: str = "web"




def create_notification_router(
    db,
    DELIVERABLE_TYPE_CATEGORIES,
    DEPARTMENT_TO_STAGE,
    WorkItem,
    _APPROVAL_NOTICE_QUERY,
    _start_notification_scans,
    can_user_create_stage,
    get_acting_user,
    get_time_benchmark,
    now_iso,
    validate_work_category_rules,
) -> APIRouter:
    router = APIRouter()

    @router.get("/notifications")
    async def list_notifications(request: Request, limit: int = 50):
        user = await get_acting_user(request)
        # The periodic scans (overdue deadlines, reminders) used to run inside
        # whichever request happened to land outside their throttle window, which
        # made that one bell poll take 3-4 seconds. They now run in the
        # background; anything they create shows up on the next poll.
        _start_notification_scans()

        limit = max(1, min(limit, 100))
        query: dict = {"user_id": user.id}
        if user.role != "manager":
            # Approval notices are for managers only; hide any already stored for
            # someone else (the startup migration also deletes them).
            query["$nor"] = _APPROVAL_NOTICE_QUERY["$or"]
        rows = await db.notifications.find(
            query,
            {"_id": 0},
        ).sort("created_at", -1).to_list(limit)

        # The bell opens the exact item a notification is about (the deliverable
        # in Approvals, its rows in the work sheet), and the work sheet finds it
        # by name. Notifications saved before names were stored get theirs here,
        # with one lookup for the whole list.
        missing = {
            row["deliverable_id"]
            for row in rows
            if row.get("deliverable_id") and not row.get("deliverable_name")
        }
        if missing:
            names = {
                d["id"]: d.get("name") or ""
                for d in await db.deliverables.find(
                    {"id": {"$in": list(missing)}}, {"_id": 0, "id": 1, "name": 1}
                ).to_list(len(missing))
            }
            for row in rows:
                if row.get("deliverable_id") and not row.get("deliverable_name"):
                    row["deliverable_name"] = names.get(row["deliverable_id"], "")

        # Every open tab asks for this list every few seconds, and almost every
        # time nothing has changed. Tag the response with a hash of its content:
        # the browser sends it back as If-None-Match and gets an empty 304 when
        # the list is identical, instead of downloading the same list again.
        # `no-cache` makes the browser revalidate every time, so a new
        # notification still shows up on the very next poll.
        body = json.dumps(rows, separators=(",", ":"), default=str)
        etag = '"' + hashlib.md5(body.encode("utf-8")).hexdigest() + '"'
        headers = {"ETag": etag, "Cache-Control": "private, no-cache"}
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers=headers)
        return Response(content=body, media_type="application/json", headers=headers)


    @router.post("/notifications/{notification_id}/read")
    async def mark_notification_read(notification_id: str, request: Request):
        user = await get_acting_user(request)
        result = await db.notifications.update_one(
            {"id": notification_id, "user_id": user.id},
            {"$set": {"read_at": now_iso()}},
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        return {"success": True}


    @router.post("/notifications/read-all")
    async def mark_all_notifications_read(request: Request):
        user = await get_acting_user(request)
        result = await db.notifications.update_many(
            {"user_id": user.id, "read_at": None},
            {"$set": {"read_at": now_iso()}},
        )
        return {"success": True, "count": result.modified_count}




    @router.post("/push/register")
    async def register_push_token(payload: PushTokenPayload, request: Request):
        """Attach this browser's FCM token to the logged-in user. Keyed by token,
        so a browser that switches accounts is simply re-assigned."""
        user = await get_acting_user(request)
        now = now_iso()

        for attempt in range(2):
            try:
                await db.push_tokens.update_one(
                    {"token": payload.token},
                    {
                        "$set": {
                            "user_id": user.id,
                            "platform": payload.platform,
                            "last_seen_at": now,
                        },
                        "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now},
                    },
                    upsert=True,
                )
                break
            except DuplicateKeyError:
                # Two concurrent registrations of a brand-new token raced on the
                # unique index; the retry takes the update path.
                if attempt == 1:
                    raise
        return {"success": True}


    @router.post("/push/unregister")
    async def unregister_push_token(payload: PushTokenPayload, request: Request):
        user = await get_acting_user(request)
        await db.push_tokens.delete_one({"token": payload.token, "user_id": user.id})
        return {"success": True}


    @router.post("/notifications/{notification_id}/add-row")
    async def add_work_row_from_notification(notification_id: str, request: Request):
        user = await get_acting_user(request)
        if user.role == "admin":
            raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")

        notification = await db.notifications.find_one(
            {"id": notification_id, "user_id": user.id},
            {"_id": 0},
        )
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")

        if notification.get("action_type") != "add_work_row":
            raise HTTPException(status_code=400, detail="This notification has no row action")

        if notification.get("actioned_at"):
            raise HTTPException(status_code=409, detail="A worksheet row has already been added from this notification")

        project = await db.projects.find_one(
            {"id": notification.get("project_id")},
            {"_id": 0},
        )
        deliverable = await db.deliverables.find_one(
            {"id": notification.get("deliverable_id")},
            {"_id": 0},
        )

        if not project or not deliverable:
            raise HTTPException(status_code=404, detail="Project or deliverable no longer exists")

        stage = notification.get("stage") or DEPARTMENT_TO_STAGE.get(user.department)
        if not can_user_create_stage(user, stage):
            raise HTTPException(status_code=403, detail="You can only add rows for your production stage")

        work_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        item = WorkItem(
            work_date=work_date,
            month=work_date[:7],
            deliverable_name=deliverable.get("name", ""),
            deliverable_type=deliverable.get("type", ""),
            work_category=DELIVERABLE_TYPE_CATEGORIES.get(
                deliverable.get("type") or "",
                "Core",
            ),
            creator_id=user.id,
            reviewer_id=None,
            manager_id=None,
            client_id=project.get("client_id"),
            project_id=project.get("id"),
            deliverable_id=deliverable.get("id"),
            stage=stage,
            remarks="",
            status="Not Started",
            created_at=now_iso(),
            updated_at=now_iso(),
        )

        # The row already has its deliverable type, so fill the time from this
        # person's own benchmark for it (Non-Core types simply have none).
        benchmark = await get_time_benchmark([user.id], item.deliverable_type)
        if benchmark:
            item.time_taken_minutes = benchmark
            item.time_source = "auto"
            item.time_benchmark_minutes = benchmark

        validate_work_category_rules(item.model_dump())

        # Reserve the notification action atomically so two rapid clicks/tabs
        # cannot create duplicate worksheet rows.
        actioned_at = now_iso()
        reserved = await db.notifications.update_one(
            {"id": notification_id, "user_id": user.id, "actioned_at": None},
            {"$set": {"actioned_at": actioned_at, "read_at": actioned_at}},
        )
        if reserved.matched_count == 0:
            raise HTTPException(
                status_code=409,
                detail="A worksheet row has already been added from this notification",
            )

        try:
            await db.work_items.insert_one(item.model_dump())
        except Exception:
            # Allow a retry if the actual row insert failed.
            await db.notifications.update_one(
                {"id": notification_id, "user_id": user.id, "actioned_at": actioned_at},
                {"$set": {"actioned_at": None, "read_at": None}},
            )
            raise

        return item

    return router
