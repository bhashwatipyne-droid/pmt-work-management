"""Projects team task sheet (Work Sheet > Projects tab).

The Projects team runs a list of follow-ups (client calls, internal reviews,
cost proposals, vendor chases...) that stay open for days or weeks. In their
old Google Sheet they copied the whole list to a new date block every day.
Here a task is ONE row that stays open until it is marked Done; the sheet for
any day shows the tasks open on that day, so nothing is copied by hand. What
changed on a given day is kept as that day's update note.

This is coordination work, not production work: it is stored apart from
work_items / work_item_activity_log and never counts toward efficiency.

  GET    /project-tasks                      {tasks, updates, options}
  POST   /project-tasks                      add a row (all fields optional)
  PATCH  /project-tasks/{id}                 edit cells
  DELETE /project-tasks/{id}                 remove a row (creator, owner, manager, admin)
  PUT    /project-tasks/{id}/updates/{day}   set that day's update note ("" clears it)

Collections:
  project_tasks          one document per task (fields below)
  project_task_updates   {id, task_id, day, note, user_id, updated_at}, one per task per day
  project_task_activity  {id, task_id, field, old_value, new_value, changed_by, changed_at}
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict

TASKS = "project_tasks"
UPDATES = "project_task_updates"
ACTIVITY = "project_task_activity"

TASK_TYPES = [
    "Client Meeting",
    "Client Call",
    "Client Follow-up",
    "Client & Internal Follow-up",
    "Internal Follow-up",
    "Internal Review",
    "Internal Briefing",
    "Internal Meeting",
    "Cost Proposal",
    "Quality Check",
    "Vendor Follow-up",
    "Admin",
]
# Types that happen at a time of day, so the Meeting column applies.
MEETING_TYPES = {"Client Meeting", "Client Call", "Internal Briefing", "Internal Meeting"}
STATUSES = ["On track", "At risk", "Waiting on client", "Delayed", "Done"]
TEAMS = ["Content", "Design", "Animation", "Accounts", "Video"]

try:
    from zoneinfo import ZoneInfo

    IST = ZoneInfo("Asia/Kolkata")
except Exception:  # pragma: no cover - no tz database
    IST = timezone(timedelta(hours=5, minutes=30))

_DAY = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Fields a person can set from the sheet.
EDITABLE = [
    "task",
    "task_type",
    "client_id",
    "project_id",
    "spoc",
    "owner_id",
    "collaborator_ids",
    "follow_up_teams",
    "follow_up_user_ids",
    "follow_up_others",
    "internal_follow_up_date",
    "client_follow_up_date",
    "status",
    "delay_reason",
    "meeting_time",
    "deliverable_count",
    "start_date",
    "sort_order",
]


class ProjectTaskIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    task: Optional[str] = None
    task_type: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    spoc: Optional[str] = None
    owner_id: Optional[str] = None
    collaborator_ids: Optional[List[str]] = None
    follow_up_teams: Optional[List[str]] = None
    follow_up_user_ids: Optional[List[str]] = None
    follow_up_others: Optional[str] = None
    internal_follow_up_date: Optional[str] = None
    client_follow_up_date: Optional[str] = None
    status: Optional[str] = None
    delay_reason: Optional[str] = None
    meeting_time: Optional[str] = None
    deliverable_count: Optional[int] = None
    start_date: Optional[str] = None
    # Position on the sheet when rows are dragged into an order (lower first).
    sort_order: Optional[float] = None
    # The day the sheet is showing; a row added or closed there gets that date.
    day: Optional[str] = None


class UpdateNoteIn(BaseModel):
    note: str = ""


def today_ist() -> str:
    return datetime.now(IST).date().isoformat()


def _day_or_none(value: Optional[str], field: str) -> Optional[str]:
    if value in (None, ""):
        return None
    if not _DAY.match(value):
        raise HTTPException(status_code=400, detail=f"{field} must be a date (YYYY-MM-DD)")
    try:
        date.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{field} is not a real date")
    return value


def _clean_ids(values: Optional[List[str]]) -> List[str]:
    seen, out = set(), []
    for v in values or []:
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def create_project_tasks_router(
    db,
    get_acting_user: Callable[[Request], Awaitable[Any]],
    now_iso: Callable[[], str],
    today: Callable[[], str] = today_ist,
) -> APIRouter:
    router = APIRouter(prefix="/project-tasks", tags=["project-tasks"])
    tasks = db[TASKS]
    updates = db[UPDATES]
    activity = db[ACTIVITY]

    async def editor(request: Request):
        user = await get_acting_user(request)
        if user.role == "hr":
            raise HTTPException(status_code=403, detail="HR can't edit the Projects sheet")
        return user

    def validate(fields: dict) -> dict:
        """Check and normalise the editable fields present in `fields`."""
        out = {}
        for key in EDITABLE:
            if key not in fields:
                continue
            value = fields[key]
            if key in ("internal_follow_up_date", "client_follow_up_date", "start_date"):
                value = _day_or_none(value, key)
            elif key == "task_type":
                if value and value not in TASK_TYPES:
                    raise HTTPException(status_code=400, detail=f"Unknown task type: {value}")
                value = value or ""
            elif key == "status":
                if value not in STATUSES:
                    raise HTTPException(status_code=400, detail=f"Unknown status: {value}")
            elif key == "follow_up_teams":
                bad = [t for t in value or [] if t not in TEAMS]
                if bad:
                    raise HTTPException(status_code=400, detail=f"Unknown team: {bad[0]}")
                value = [t for t in TEAMS if t in (value or [])]
            elif key in ("collaborator_ids", "follow_up_user_ids"):
                value = _clean_ids(value)
            elif key == "sort_order":
                pass
            elif key == "deliverable_count":
                if value is not None and value < 0:
                    raise HTTPException(status_code=400, detail="Deliverable count can't be negative")
            elif isinstance(value, str) or value is None:
                value = (value or "").strip() if key not in ("client_id", "project_id", "owner_id") else (value or None)
            out[key] = value
        if out.get("start_date") is None and "start_date" in out:
            raise HTTPException(status_code=400, detail="A task needs a start date")
        return out

    async def check_links(fields: dict, current: Optional[dict] = None):
        """Client/project/people must exist; a project must belong to the client."""
        merged = {**(current or {}), **fields}
        if fields.get("client_id") and not await db.clients.find_one({"id": fields["client_id"]}, {"_id": 1}):
            raise HTTPException(status_code=400, detail="That client doesn't exist")
        if merged.get("project_id"):
            project = await db.projects.find_one(
                {"id": merged["project_id"]}, {"_id": 0, "id": 1, "client_id": 1}
            )
            if not project:
                raise HTTPException(status_code=400, detail="That project doesn't exist")
            if merged.get("client_id") and project.get("client_id") != merged["client_id"]:
                if "client_id" in fields and "project_id" not in fields:
                    # A new client clears a project that belonged to the old one.
                    fields["project_id"] = None
                else:
                    raise HTTPException(status_code=400, detail="That project belongs to another client")
        people = [fields.get("owner_id")] + list(fields.get("collaborator_ids") or []) + list(
            fields.get("follow_up_user_ids") or []
        )
        people = [p for p in people if p]
        if people:
            found = set(await db.users.distinct("id", {"id": {"$in": people}}))
            missing = [p for p in people if p not in found]
            if missing:
                raise HTTPException(status_code=400, detail="One of the people picked doesn't exist")
        # The owner is never also listed as a collaborator.
        owner = merged.get("owner_id")
        if owner and owner in (merged.get("collaborator_ids") or []):
            fields["collaborator_ids"] = [c for c in merged["collaborator_ids"] if c != owner]

    def apply_status(fields: dict, current: dict, day: str):
        """Done stamps the day it was closed; any other status reopens it."""
        if "status" not in fields:
            return
        if fields["status"] == "Done" and current.get("status") != "Done":
            fields["done_date"] = day
        elif fields["status"] != "Done":
            fields["done_date"] = None

    async def log_changes(task_id: str, before: dict, after: dict, user_id: str):
        ts = now_iso()
        docs = []
        for key, new in after.items():
            old = before.get(key)
            if key in ("updated_at", "updated_by") or old == new:
                continue
            docs.append({
                "id": str(uuid.uuid4()),
                "task_id": task_id,
                "field": key,
                "old_value": old,
                "new_value": new,
                "changed_by": user_id,
                "changed_at": ts,
            })
        if docs:
            await activity.insert_many(docs)

    @router.get("")
    async def list_tasks(request: Request):
        await get_acting_user(request)
        rows = await tasks.find({}, {"_id": 0}).sort("created_at", 1).to_list(20000)
        notes = await updates.find({}, {"_id": 0}).sort("day", 1).to_list(100000)
        return {
            "tasks": rows,
            "updates": notes,
            "today": today(),
            "options": {
                "task_types": TASK_TYPES,
                "meeting_types": sorted(MEETING_TYPES),
                "statuses": STATUSES,
                "teams": TEAMS,
            },
        }

    @router.post("")
    async def create_task(payload: ProjectTaskIn, request: Request):
        user = await editor(request)
        raw = payload.model_dump(exclude_unset=True)
        day = _day_or_none(raw.pop("day", None), "day") or today()
        fields = validate(raw)
        await check_links(fields)
        ts = now_iso()
        doc = {
            "id": str(uuid.uuid4()),
            "task": "",
            "task_type": "",
            "client_id": None,
            "project_id": None,
            "spoc": "",
            "owner_id": user.id,
            "collaborator_ids": [],
            "follow_up_teams": [],
            "follow_up_user_ids": [],
            "follow_up_others": "",
            "internal_follow_up_date": None,
            "client_follow_up_date": None,
            "status": "On track",
            "delay_reason": "",
            "meeting_time": "",
            "deliverable_count": None,
            "start_date": day,
            "done_date": None,
            "sort_order": None,
            "created_by": user.id,
            "created_at": ts,
            "updated_at": ts,
            "updated_by": user.id,
        }
        doc.update(fields)
        apply_status(fields, {}, day)
        doc["done_date"] = fields.get("done_date", doc["done_date"])
        await tasks.insert_one(dict(doc))
        return doc

    @router.patch("/{task_id}")
    async def update_task(task_id: str, payload: ProjectTaskIn, request: Request):
        user = await editor(request)
        current = await tasks.find_one({"id": task_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Task not found")
        raw = payload.model_dump(exclude_unset=True)
        day = _day_or_none(raw.pop("day", None), "day") or today()
        fields = validate(raw)
        await check_links(fields, current)
        apply_status(fields, current, day)
        if not fields:
            return current
        fields["updated_at"] = now_iso()
        fields["updated_by"] = user.id
        await tasks.update_one({"id": task_id}, {"$set": fields})
        await log_changes(task_id, current, fields, user.id)
        return {**current, **fields}

    @router.delete("/{task_id}")
    async def delete_task(task_id: str, request: Request):
        user = await editor(request)
        current = await tasks.find_one({"id": task_id}, {"_id": 0})
        if not current:
            raise HTTPException(status_code=404, detail="Task not found")
        if user.role not in ("admin", "manager") and user.id not in (
            current.get("created_by"),
            current.get("owner_id"),
        ):
            raise HTTPException(status_code=403, detail="Only the task's owner, its creator or a manager can delete it")
        await tasks.delete_one({"id": task_id})
        await updates.delete_many({"task_id": task_id})
        await activity.insert_one({
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "field": "deleted",
            "old_value": current.get("task"),
            "new_value": None,
            "changed_by": user.id,
            "changed_at": now_iso(),
        })
        return {"deleted": True}

    @router.put("/{task_id}/updates/{day}")
    async def set_update(task_id: str, day: str, payload: UpdateNoteIn, request: Request):
        user = await editor(request)
        _day_or_none(day, "day")
        if not await tasks.find_one({"id": task_id}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="Task not found")
        note = payload.note.strip()
        if not note:
            await updates.delete_one({"task_id": task_id, "day": day})
            return {"task_id": task_id, "day": day, "note": ""}
        doc = {"note": note, "user_id": user.id, "updated_at": now_iso()}
        await updates.update_one(
            {"task_id": task_id, "day": day},
            {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "task_id": task_id, "day": day}},
            upsert=True,
        )
        return {"task_id": task_id, "day": day, **doc}

    return router


async def ensure_project_task_indexes(db):
    await db[TASKS].create_index("id")
    await db[UPDATES].create_index([("task_id", 1), ("day", 1)])
    await db[ACTIVITY].create_index("task_id")
