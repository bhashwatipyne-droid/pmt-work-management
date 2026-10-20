from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError
import asyncio
import contextlib
import hashlib
import secrets
import smtplib
from email.message import EmailMessage
from email.utils import parseaddr
from contextvars import ContextVar
import json
import time
import math
import threading
import weakref
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
import os
import re
import certifi
import logging
import string
import random
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import Dict, List, Optional
import uuid
from urllib.parse import quote
from datetime import datetime, timezone, timedelta

try:
    # Works when the working directory is backend/ (e.g. `uvicorn server:app`)
    from users import create_users_router  # noqa: F401
    import projects_read  # noqa: F401
    from projects_read import create_projects_read_router  # noqa: F401
    from projects_write import create_projects_write_router  # noqa: F401
    from deliverables import create_deliverables_router  # noqa: F401
    from approvals import create_approvals_router  # noqa: F401
    from work_items_routes import create_work_items_router  # noqa: F401
    from common import now_iso  # noqa: F401
    from stage_rules import (  # noqa: F401
        normalize_stages,
        stored_stages,
        next_selected_stage,
        reconcile_stage_after_edit,
        _format_date_short,
        format_stage_window,
        normalize_stage_schedule,
        derive_deliverable_dates,
    )
    from notifications import (  # noqa: F401
        _APPROVAL_NOTICE_QUERY,
        _ensure_overdue_notifications,
        _ensure_reminder_notifications,
        _fire_and_forget,
        _get_firebase_app,
        _keyed_lock,
        _notify_admins_deliverable_missing,
        _notify_new_project,
        _upsert_notification,
        _upsert_notifications_batch,
    )
    from auth_routes import create_auth_router  # noqa: F401
    from dashboard_routes import create_dashboard_router  # noqa: F401
    from notification_routes import create_notification_router  # noqa: F401
    from lookups import create_lookups_router  # noqa: F401
    from constants import (  # noqa: F401
        APPROVAL_STATUSES,
        APPROVAL_TYPES,
        DELIVERABLE_TYPES,
        DELIVERABLE_TYPE_UNITS,
        DEPARTMENTS,
        HR_ALLOWED_PREFIXES,
        MAX_UNIT_ROWS,
        MEMBER_FORWARD_STATUSES,
        PROJECT_LIST_LIMIT,
        PROJECT_STATUSES,
        ROLES,
        STAGE_STATUSES,
        STATUSES,
        UNIT_ROWS_DEPARTMENT,
        WORK_CATEGORIES,
        search_clauses,
    )
    from models import (  # noqa: F401
        BulkCreatePayload,
        BulkDeletePayload,
        BulkProjectIdsPayload,
        BulkProjectStatusPayload,
        BulkUpdatePayload,
        Deliverable,
        DeliverableInput,
        Project,
        ProjectCreate,
        ProjectReorderPayload,
        ProjectUpdate,
        User,
        UserCreate,
        UserUpdate,
        WorkItem,
        WorkItemCreate,
        WorkItemUpdate,
    )
    from security import (  # noqa: F401
        ACCESS_TOKEN_HOURS,
        JWT_ALGORITHM,
        MEMBER_APPROVAL_STAGE_SCOPE,
        _USER_CACHE_TTL_SECONDS,
        _activity_doc,
        _approvals_view_all,
        _invalidate_cached_user,
        _member_approval_stage,
        _member_can_view_approval,
        _user_cache,
        can_user_create_stage,
        create_access_token,
        gen_project_code,
        get_acting_user,
        get_user_department,
        get_user_role,
        hash_password,
        log_activity,
        require_admin,
        require_approver,
        require_manager,
        require_manager_or_admin,
        verify_password,
    )
    from clients import Client, ClientCreate, ClientUpdate, create_clients_router, validate_contact_phone  # noqa: F401
    from efficiency import create_efficiency_router  # noqa: F401
    from home_dashboard import create_home_dashboard_router  # noqa: F401
    from invoicing import create_invoicing_router  # noqa: F401
    from planning import create_planning_router  # noqa: F401
    from project_share import create_project_share_router  # noqa: F401
    from project_tasks import create_project_tasks_router, ensure_project_task_indexes  # noqa: F401
    from meetings import calendar_sync_loop, create_meetings_router, ensure_meeting_indexes  # noqa: F401
    import deliverable_import  # noqa: F401
    import project_duplicates  # noqa: F401
    from ttl_cache import VersionedTTLCache  # noqa: F401
    from db_client import client, db  # noqa: F401
    from domain_constants import (  # noqa: F401
        ANY_MANAGER_APPROVAL_TYPES,
        CLIENT_STATUSES,
        NON_TEAM_ROLES,
        DELIVERABLE_TYPE_CATEGORIES,
        DEPARTMENT_TO_STAGE,
        DONE_STATUSES,
        MEMBER_EDITABLE_FIELDS,
        STAGES,
    )
    from work_items_rules import (  # noqa: F401
        DELIVERABLE_GATED_STATUSES,
        LOW_TIME_EXEMPT_TYPES,
        LOW_TIME_RATIO,
        MAX_QUANTITY,
        MAX_VIDEO_DURATION_SECONDS,
        MAX_WORK_DATE,
        MAX_WORK_ITEM_MINUTES,
        MIN_WORK_DATE,
        MULTI_DELIVERABLE_STAGE,
        MULTI_DELIVERABLE_TYPE_PREFIX,
        QUANTITY_STAGES,
        TIME_GATED_STATUSES,
        TIME_REQUIRED_MESSAGE,
        _cached_lookup,
        _clean_ids,
        _clear_video_duration,
        _has_video_duration,
        _lookup_cache,
        _minutes_label,
        _time_worker_ids,
        _valid_minutes,
        apply_deliverable_list_rules,
        apply_deliverable_rules,
        apply_quantity_rules,
        apply_time_rules,
        deliverable_required_for,
        get_time_benchmark,
        is_content_quantity_row,
        is_multi_deliverable_row,
        normalize_video_duration,
        quantity_applies,
        scoped_update_fields,
        units_of,
        validate_deliverable_ids,
        validate_work_category_rules,
        validate_work_date,
    )
except ImportError:
    # Works when uvicorn imports this as a package member from the repo root
    # (e.g. Render's `uvicorn backend.server:app`)
    from backend.users import create_users_router  # noqa: F401
    from backend import projects_read  # noqa: F401
    from backend.projects_read import create_projects_read_router  # noqa: F401
    from backend.projects_write import create_projects_write_router  # noqa: F401
    from backend.deliverables import create_deliverables_router  # noqa: F401
    from backend.approvals import create_approvals_router  # noqa: F401
    from backend.work_items_routes import create_work_items_router  # noqa: F401
    from backend.common import now_iso  # noqa: F401
    from backend.stage_rules import (  # noqa: F401
        normalize_stages,
        stored_stages,
        next_selected_stage,
        reconcile_stage_after_edit,
        _format_date_short,
        format_stage_window,
        normalize_stage_schedule,
        derive_deliverable_dates,
    )
    from backend.notifications import (  # noqa: F401
        _APPROVAL_NOTICE_QUERY,
        _ensure_overdue_notifications,
        _ensure_reminder_notifications,
        _fire_and_forget,
        _get_firebase_app,
        _keyed_lock,
        _notify_admins_deliverable_missing,
        _notify_new_project,
        _upsert_notification,
        _upsert_notifications_batch,
    )
    from backend.auth_routes import create_auth_router  # noqa: F401
    from backend.dashboard_routes import create_dashboard_router  # noqa: F401
    from backend.notification_routes import create_notification_router  # noqa: F401
    from backend.lookups import create_lookups_router  # noqa: F401
    from backend.constants import (  # noqa: F401
        APPROVAL_STATUSES,
        APPROVAL_TYPES,
        DELIVERABLE_TYPES,
        DELIVERABLE_TYPE_UNITS,
        DEPARTMENTS,
        HR_ALLOWED_PREFIXES,
        MAX_UNIT_ROWS,
        MEMBER_FORWARD_STATUSES,
        PROJECT_LIST_LIMIT,
        PROJECT_STATUSES,
        ROLES,
        STAGE_STATUSES,
        STATUSES,
        UNIT_ROWS_DEPARTMENT,
        WORK_CATEGORIES,
        search_clauses,
    )
    from backend.models import (  # noqa: F401
        BulkCreatePayload,
        BulkDeletePayload,
        BulkProjectIdsPayload,
        BulkProjectStatusPayload,
        BulkUpdatePayload,
        Deliverable,
        DeliverableInput,
        Project,
        ProjectCreate,
        ProjectReorderPayload,
        ProjectUpdate,
        User,
        UserCreate,
        UserUpdate,
        WorkItem,
        WorkItemCreate,
        WorkItemUpdate,
    )
    from backend.security import (  # noqa: F401
        ACCESS_TOKEN_HOURS,
        JWT_ALGORITHM,
        MEMBER_APPROVAL_STAGE_SCOPE,
        _USER_CACHE_TTL_SECONDS,
        _activity_doc,
        _approvals_view_all,
        _invalidate_cached_user,
        _member_approval_stage,
        _member_can_view_approval,
        _user_cache,
        can_user_create_stage,
        create_access_token,
        gen_project_code,
        get_acting_user,
        get_user_department,
        get_user_role,
        hash_password,
        log_activity,
        require_admin,
        require_approver,
        require_manager,
        require_manager_or_admin,
        verify_password,
    )
    from backend.clients import Client, ClientCreate, ClientUpdate, create_clients_router, validate_contact_phone  # noqa: F401
    from backend.efficiency import create_efficiency_router  # noqa: F401
    from backend.home_dashboard import create_home_dashboard_router  # noqa: F401
    from backend.invoicing import create_invoicing_router  # noqa: F401
    from backend.planning import create_planning_router  # noqa: F401
    from backend.project_share import create_project_share_router  # noqa: F401
    from backend.project_tasks import create_project_tasks_router, ensure_project_task_indexes  # noqa: F401
    from backend.meetings import calendar_sync_loop, create_meetings_router, ensure_meeting_indexes  # noqa: F401
    from backend import deliverable_import  # noqa: F401
    from backend import project_duplicates  # noqa: F401
    from backend.ttl_cache import VersionedTTLCache  # noqa: F401
    from backend.db_client import client, db  # noqa: F401
    from backend.domain_constants import (  # noqa: F401
        ANY_MANAGER_APPROVAL_TYPES,
        CLIENT_STATUSES,
        NON_TEAM_ROLES,
        DELIVERABLE_TYPE_CATEGORIES,
        DEPARTMENT_TO_STAGE,
        DONE_STATUSES,
        MEMBER_EDITABLE_FIELDS,
        STAGES,
    )
    from backend.work_items_rules import (  # noqa: F401
        DELIVERABLE_GATED_STATUSES,
        LOW_TIME_EXEMPT_TYPES,
        LOW_TIME_RATIO,
        MAX_QUANTITY,
        MAX_VIDEO_DURATION_SECONDS,
        MAX_WORK_DATE,
        MAX_WORK_ITEM_MINUTES,
        MIN_WORK_DATE,
        MULTI_DELIVERABLE_STAGE,
        MULTI_DELIVERABLE_TYPE_PREFIX,
        QUANTITY_STAGES,
        TIME_GATED_STATUSES,
        TIME_REQUIRED_MESSAGE,
        _cached_lookup,
        _clean_ids,
        _clear_video_duration,
        _has_video_duration,
        _lookup_cache,
        _minutes_label,
        _time_worker_ids,
        _valid_minutes,
        apply_deliverable_list_rules,
        apply_deliverable_rules,
        apply_quantity_rules,
        apply_time_rules,
        deliverable_required_for,
        get_time_benchmark,
        is_content_quantity_row,
        is_multi_deliverable_row,
        normalize_video_duration,
        quantity_applies,
        scoped_update_fields,
        units_of,
        validate_deliverable_ids,
        validate_work_category_rules,
        validate_work_date,
    )


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Short-lived cache for the read endpoints the browser polls and for the heavy
# dashboard reads (see ttl_cache.py). Dropped on every write request, and by
# time for writes that bypass requests (background sweeps, the WhatsApp listener).
# Set READ_CACHE_SECONDS=0 to switch it off.
READ_CACHE_SECONDS = float(os.environ.get("READ_CACHE_SECONDS", "30"))
read_cache = VersionedTTLCache(ttl=READ_CACHE_SECONDS)


async def cached_read(key: str, compute, ttl: Optional[float] = None):
    """compute() through the read cache (straight through when it is off)."""
    if READ_CACHE_SECONDS <= 0:
        return await compute()
    return await read_cache.get_or_compute(key, compute, ttl)

app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Work Sheet API"}


class LoginPayload(BaseModel):
    login: str
    password: str


class LoginResponse(User):
    # Same token that is set in the cookie. The web app only keeps it when the
    # browser refuses the cross-site cookie (Incognito, Safari, Brave...), and
    # then sends it as "Authorization: Bearer" (see get_acting_user).
    access_token: Optional[str] = None


# Failed-login throttle. Kept in this process's memory (no extra collection or
# dependency), so each server instance counts on its own and a restart clears it:
# it stops casual password guessing, it is not a distributed lockout.
LOGIN_MAX_FAILS_PER_LOGIN = int(os.environ.get("LOGIN_MAX_FAILS_PER_LOGIN", "5"))
LOGIN_MAX_FAILS_PER_IP = int(os.environ.get("LOGIN_MAX_FAILS_PER_IP", "30"))
LOGIN_FAIL_WINDOW_SECONDS = int(os.environ.get("LOGIN_FAIL_WINDOW_SECONDS", "900"))
_login_fails: dict = {}


def _client_ip(request: Request) -> str:
    # Behind Render/Vercel the real caller is the first X-Forwarded-For entry.
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _recent_fails(key: str, now_s: float) -> list:
    cutoff = now_s - LOGIN_FAIL_WINDOW_SECONDS
    recent = [t for t in _login_fails.get(key, []) if t > cutoff]
    if recent:
        _login_fails[key] = recent
    else:
        _login_fails.pop(key, None)
    return recent


def _check_login_throttle(ip: str, login: str) -> None:
    now_s = time.monotonic()
    by_login = _recent_fails(f"login:{ip}:{login}", now_s)
    by_ip = _recent_fails(f"ip:{ip}", now_s)
    if len(by_login) >= LOGIN_MAX_FAILS_PER_LOGIN or len(by_ip) >= LOGIN_MAX_FAILS_PER_IP:
        oldest = min(by_login or by_ip)
        retry_after = max(1, int(LOGIN_FAIL_WINDOW_SECONDS - (now_s - oldest)))
        raise HTTPException(
            status_code=429,
            detail="Too many failed sign-in attempts. Try again in a few minutes.",
            headers={"Retry-After": str(retry_after)},
        )


def _record_login_failure(ip: str, login: str) -> None:
    now_s = time.monotonic()
    _login_fails.setdefault(f"login:{ip}:{login}", []).append(now_s)
    _login_fails.setdefault(f"ip:{ip}", []).append(now_s)
    if len(_login_fails) > 5000:
        # Bound memory: drop entries whose attempts have all aged out.
        for key in list(_login_fails):
            _recent_fails(key, now_s)


@api_router.post("/work-items", response_model=WorkItem)
async def create_work_item(payload: WorkItemCreate, request: Request):
    user = await get_acting_user(request)
    return await _create_work_item_as(user, payload)


async def _create_work_item_for_user_id(user_id: str, payload: WorkItemCreate):
    """The same Work Sheet row creation, for a background job that has no
    logged-in request (auto-accepting a WhatsApp task). Every rule in
    _create_work_item_as still applies, as that user."""
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc or not doc.get("active", True):
        raise HTTPException(status_code=400, detail="That person cannot be assigned work")
    return await _create_work_item_as(User(**doc), payload)


async def _create_work_item_for_task(user_id: str, payload: WorkItemCreate, source_task_id: str):
    """Work Sheet row for an accepted WhatsApp task. source_task_id is written
    in the same insert as the row, and a unique index on it makes a retry
    (or a manual accept racing the auto-accept job) return the existing row
    instead of creating a second one."""
    doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not doc or not doc.get("active", True):
        raise HTTPException(status_code=400, detail="That person cannot be assigned work")
    return await _create_work_item_as(
        User(**doc),
        payload,
        extra_fields={"source": "whatsapp_task", "source_task_id": source_task_id},
    )


async def _create_work_item_as(user: User, payload: WorkItemCreate, extra_fields: Optional[dict] = None):
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")

    if not can_user_create_stage(user, payload.stage):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to add rows to this stage",
        )

    data = payload.model_dump()
    work_date = data.pop("work_date", None) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    validate_work_date(work_date)
    month = work_date[:7]
    if user.role == "member":
        data["creator_id"] = user.id
        data["reviewer_id"] = None
        data["manager_id"] = None
    else:
        data["creator_id"] = data.get("creator_id") or user.id

    if data.get("client_id"):
        client = await db.clients.find_one({"id": data["client_id"]}, {"_id": 0, "id": 1})
        if not client:
            raise HTTPException(status_code=400, detail="Invalid client")

    if data.get("project_id"):
        project = await db.projects.find_one(
            {"id": data["project_id"]},
            {"_id": 0, "client_id": 1},
        )
        if not project:
            raise HTTPException(status_code=400, detail="Invalid project")
        if data.get("client_id") and data["client_id"] != project.get("client_id"):
            raise HTTPException(status_code=400, detail="Project does not belong to selected client")
        data["client_id"] = project.get("client_id")

    await validate_deliverable_ids(data)

    data["deliverable_not_available"] = bool(data.get("deliverable_not_available"))
    apply_deliverable_rules({}, data)
    apply_quantity_rules({}, data)
    await apply_time_rules(user, {}, data, creator_id=data.get("creator_id"))

    validate_work_category_rules({**data, "work_date": work_date})

    ts = now_iso()
    item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
    row = item.model_dump()
    if extra_fields:
        row.update(extra_fields)
    try:
        await db.work_items.insert_one(row)
    except DuplicateKeyError:
        # Only the unique source_task_id index can trip here: this task already
        # has its row, so hand that one back rather than making a second.
        source_task_id = (extra_fields or {}).get("source_task_id")
        existing = (
            await db.work_items.find_one({"source_task_id": source_task_id}, {"_id": 0})
            if source_task_id
            else None
        )
        if not existing:
            raise
        return WorkItem(**existing)

    if item.deliverable_not_available:
        await _notify_admins_deliverable_missing(user, item.model_dump())

    return item


REVIEW_AUTO_CLOSE_HOURS = float(os.environ.get("REVIEW_AUTO_CLOSE_HOURS", "24"))


def _parse_iso_utc(value) -> Optional[datetime]:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


async def auto_close_stale_reviews() -> int:
    """Approve (-> Closed) every Bulk Review row that has been waiting on a
    manager for longer than REVIEW_AUTO_CLOSE_HOURS, exactly as the Approve
    button does: same status change, same activity-log entry, but by "system"
    and marked as automatic. Rows assigned to admins are not touched. Returns
    how many were closed."""
    if REVIEW_AUTO_CLOSE_HOURS <= 0:
        return 0

    manager_ids = [
        u["id"]
        for u in await db.users.find(
            {"role": "manager"}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]
    if not manager_ids:
        return 0

    rows = await db.work_items.find(
        {"status": "Ready for Review", "reviewer_id": {"$in": manager_ids}},
        {"_id": 0, "id": 1, "updated_at": 1, "created_at": 1},
    ).to_list(5000)

    cutoff = datetime.now(timezone.utc) - timedelta(hours=REVIEW_AUTO_CLOSE_HOURS)
    closed = 0
    for row in rows:
        waiting_since = _parse_iso_utc(row.get("updated_at")) or _parse_iso_utc(row.get("created_at"))
        if not waiting_since or waiting_since > cutoff:
            continue

        ts = now_iso()
        result = await db.work_items.update_one(
            # still waiting: a manager who approved or sent it back a moment ago wins
            {"id": row["id"], "status": "Ready for Review"},
            {"$set": {"status": "Closed", "updated_at": ts}},
        )
        if result.modified_count != 1:
            continue

        await log_activity(
            collection_name="work_item_activity_log",
            entity_id=row["id"],
            entity_field="work_item_id",
            action="WORK_ITEM_APPROVED",
            changed_by="system",
            old_value="Ready for Review",
            new_value="Closed",
            metadata={
                "review_note": f"Auto-closed: not reviewed within {REVIEW_AUTO_CLOSE_HOURS:g} hours",
                "auto_closed": True,
            },
        )
        closed += 1
    return closed


# Open Work Sheet rows nobody has touched for this many hours are closed by the
# background sweep (every status except On Hold; 0 turns it off). On Hold is
# paused work, so it is left open. Closed and Scrap are already finished.
STALE_ROW_AUTO_CLOSE_HOURS = float(os.environ.get("STALE_ROW_AUTO_CLOSE_HOURS", "2"))
_STALE_ROW_KEEP_OPEN = ["Closed", "Scrap", "On Hold"]


async def auto_close_stale_rows() -> int:
    """Close (-> Closed) every Work Sheet row that is still open and has had no
    change for STALE_ROW_AUTO_CLOSE_HOURS. Any edit to the row (updated_at)
    restarts the clock. Logged as a status change by "system", marked as
    automatic. Returns how many were closed."""
    if STALE_ROW_AUTO_CLOSE_HOURS <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=STALE_ROW_AUTO_CLOSE_HOURS)
    closed = 0
    async for row in db.work_items.find(
        {"status": {"$nin": _STALE_ROW_KEEP_OPEN}},
        {"_id": 0, "id": 1, "status": 1, "updated_at": 1, "created_at": 1},
    ):
        last_change = _parse_iso_utc(row.get("updated_at")) or _parse_iso_utc(row.get("created_at"))
        if not last_change or last_change > cutoff:
            continue

        old_status = row.get("status")
        ts = now_iso()
        result = await db.work_items.update_one(
            # untouched since we read it: an edit a moment ago wins
            {"id": row["id"], "status": old_status, "updated_at": row.get("updated_at")},
            {"$set": {"status": "Closed", "updated_at": ts}},
        )
        if result.modified_count != 1:
            continue

        await log_activity(
            collection_name="work_item_activity_log",
            entity_id=row["id"],
            entity_field="work_item_id",
            action="WORK_ITEM_STATUS_CHANGED",
            changed_by="system",
            old_value=old_status,
            new_value="Closed",
            metadata={
                "note": f"Auto-closed: no change for {STALE_ROW_AUTO_CLOSE_HOURS:g} hours",
                "auto_closed": True,
            },
        )
        closed += 1
    return closed


# Open Management (Projects team) tasks nobody has touched for this many hours
# are auto-closed (marked Done) by the background sweep. Any edit restarts the
# clock; already-Done tasks are left alone. Default 48h (2 days); 0 turns it off.
MGMT_TASK_AUTO_CLOSE_HOURS = float(os.environ.get("MGMT_TASK_AUTO_CLOSE_HOURS", "48"))


async def auto_close_stale_project_tasks() -> int:
    """Mark Done every Management task that is still open and has had no change
    for MGMT_TASK_AUTO_CLOSE_HOURS. updated_at restarts the clock. Logged in
    project_task_activity by "system", marked automatic. Returns how many."""
    if MGMT_TASK_AUTO_CLOSE_HOURS <= 0:
        return 0

    cutoff = datetime.now(timezone.utc) - timedelta(hours=MGMT_TASK_AUTO_CLOSE_HOURS)
    done_day = datetime.now(timezone(timedelta(hours=5, minutes=30))).date().isoformat()
    ts = now_iso()
    closed = 0
    async for task in db.project_tasks.find(
        {"status": {"$ne": "Done"}},
        {"_id": 0, "id": 1, "status": 1, "updated_at": 1, "created_at": 1},
    ):
        last_change = _parse_iso_utc(task.get("updated_at")) or _parse_iso_utc(task.get("created_at"))
        if not last_change or last_change > cutoff:
            continue

        old_status = task.get("status")
        result = await db.project_tasks.update_one(
            # untouched since we read it: an edit a moment ago wins
            {"id": task["id"], "status": old_status, "updated_at": task.get("updated_at")},
            {"$set": {"status": "Done", "done_date": done_day, "updated_at": ts, "updated_by": "system"}},
        )
        if result.modified_count != 1:
            continue

        await db.project_task_activity.insert_one({
            "id": str(uuid.uuid4()),
            "task_id": task["id"],
            "field": "status",
            "old_value": old_status,
            "new_value": "Done",
            "changed_by": "system",
            "changed_at": ts,
            "auto_closed": True,
        })
        closed += 1
    return closed


# ---------------- Collaborators: tag teammates on an entry ----------------
#
# One person logs an entry and tags teammates. Each tagged person gets their OWN
# row (their own time, status and efficiency) and every row of that entry shares
# a collab_group_id. The same call can tag several people on several entries.
#
# Guardrail - adding is idempotent. "The same entry" is decided by what was done,
# not by who typed it (date, stage, project, deliverable, type, version), so:
#   * pressing the button twice, or two people tagging the same person on the
#     same entry, never creates a second row for that person;
#   * a person who already logged that entry themselves is left alone;
#   * a unique index on collab_key backs this up when two requests race.
# Anything not created comes back in `skipped` with the reason.
COLLAB_MAX_ROWS = 200
COLLAB_MAX_PEOPLE = 50
COLLAB_NO_IDENTITY_MESSAGE = (
    "Fill in the date and the project, deliverable or type before adding collaborators."
)


def _collab_text(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def collab_fingerprint(row: dict) -> str:
    """What makes two entries 'the same piece of work', whoever logged them."""
    return "|".join([
        str(row.get("work_date") or ""),
        str(row.get("stage") or ""),
        str(row.get("project_id") or ""),
        str(row.get("deliverable_id") or ""),
        "na" if row.get("deliverable_not_available") else "",
        _collab_text(row.get("deliverable_name")),
        _collab_text(row.get("deliverable_type")),
        _collab_text(row.get("version")),
    ])


def collab_key(person_id: str, row: dict) -> str:
    digest = hashlib.sha1(collab_fingerprint(row).encode("utf-8")).hexdigest()
    return f"{person_id}:{digest}"


def collab_row_has_identity(row: dict) -> bool:
    """A blank row would be copied to everyone as junk."""
    return bool(row.get("work_date")) and bool(
        row.get("project_id")
        or row.get("deliverable_id")
        or _collab_text(row.get("deliverable_name"))
        or _collab_text(row.get("deliverable_type"))
    )


# ---------------- Dashboard ----------------
# ---------------- Clients ----------------
# ---------------- Notifications routes ----------------
_notification_scan_task: Optional["asyncio.Task"] = None


async def _run_notification_scans():
    try:
        await _ensure_overdue_notifications()
    except Exception:
        # Creating overdue notices is best-effort; it must never take the
        # notifications endpoint down.
        logger.exception("Overdue notification scan failed")
    await _ensure_reminder_notifications()


def _start_notification_scans():
    """Kick off the scans without making the caller wait for them (a scan
    that is already running is left alone; each scan also throttles itself)."""
    global _notification_scan_task
    if _notification_scan_task is not None and not _notification_scan_task.done():
        return
    _notification_scan_task = asyncio.create_task(_run_notification_scans())


# ---------------- Projects ----------------
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


# ---------------- Deliverables ----------------
class DeliverableCreate(BaseModel):
    project_id: str
    name: str
    type: Optional[str] = ""
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    approval_types: Optional[List[str]] = None
    current_stage: Optional[str] = None


class DeliverableUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: Optional[List[str]] = None
    approval_types: Optional[List[str]] = None


class ApprovalWorkflowCreate(BaseModel):
    approval_types: List[str] = Field(default_factory=list)


class ApprovalDecision(BaseModel):
    note: Optional[str] = ""


class ApprovalMove(BaseModel):
    approval_type: str


class BulkApprovalItemIdsPayload(BaseModel):
    approval_item_ids: List[str]


# ---------------- Approval helpers ----------------
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


# ---------------- Approvals (deliverable review queue) ----------------
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


api_router.include_router(
    create_efficiency_router(
        db=db,
        get_acting_user=get_acting_user,
        require_manager_or_admin=require_manager_or_admin,
        now_iso=now_iso,
        log_activity=log_activity,
        deliverable_type_categories=DELIVERABLE_TYPE_CATEGORIES,
    )
)

api_router.include_router(
    create_invoicing_router(
        db=db,
        get_acting_user=get_acting_user,
        move_project_to_status=_move_project_to_status,
        now_iso=now_iso,
        log_activity=log_activity,
    )
)

# WhatsApp tasklists -> task cards, Planning page and Work Sheet rows. Accepting
# a task goes through create_work_item(), so every Work Sheet rule applies.
api_router.include_router(
    create_clients_router(
        db=db,
        get_acting_user=get_acting_user,
        require_admin=require_admin,
        log_activity=log_activity,
    )
)

api_router.include_router(
    create_users_router(
        db=db,
        get_acting_user=get_acting_user,
        require_admin=require_admin,
        hash_password=hash_password,
        invalidate_cached_user=_invalidate_cached_user,
        user_model=User,
        user_create_model=UserCreate,
        user_update_model=UserUpdate,
        roles=ROLES,
        departments=DEPARTMENTS,
    )
)

api_router.include_router(
    create_projects_read_router(
        db=db,
        get_acting_user=get_acting_user,
        require_admin=require_admin,
        cached_read=cached_read,
        search_clauses=search_clauses,
        project_list_limit=PROJECT_LIST_LIMIT,
        project_duplicates=project_duplicates,
    )
)

api_router.include_router(
    create_projects_write_router(
        db=db,
        now_iso=now_iso,
        log_activity=log_activity,
        require_admin=require_admin,
        _hydrate_project=_hydrate_project,
        PROJECT_STATUSES=PROJECT_STATUSES,
        project_duplicates=project_duplicates,
        _move_project_to_status=_move_project_to_status,
        logger=logging.getLogger(__name__),
        BulkProjectIdsPayload=BulkProjectIdsPayload,
        normalize_stages=normalize_stages,
        _rollback_new_project=_rollback_new_project,
        _projects_touched_since=_projects_touched_since,
        _place_new_project_at_top=_place_new_project_at_top,
        _persist_deliverable_batch=_persist_deliverable_batch,
        _notify_new_project_safely=_notify_new_project_safely,
        _keyed_lock=_keyed_lock,
        _generate_unique_project_code=_generate_unique_project_code,
        _fire_and_forget=_fire_and_forget,
        _delete_approvals_for_deliverables=_delete_approvals_for_deliverables,
        _build_deliverable_batch=_build_deliverable_batch,
        User=User,
        ProjectUpdate=ProjectUpdate,
        ProjectReorderPayload=ProjectReorderPayload,
        ProjectCreate=ProjectCreate,
        Project=Project,
        BulkProjectStatusPayload=BulkProjectStatusPayload,
    )
)

api_router.include_router(
    create_deliverables_router(
        db=db,
        get_acting_user=get_acting_user,
        require_admin=require_admin,
        log_activity=log_activity,
        logger=logging.getLogger(__name__),
        deliverable_import=deliverable_import,
        Deliverable=Deliverable,
        now_iso=now_iso,
        normalize_stages=normalize_stages,
        normalize_stage_schedule=normalize_stage_schedule,
        derive_deliverable_dates=derive_deliverable_dates,
        _set_approval_items_pending=_set_approval_items_pending,
        _delete_approvals_for_deliverables=_delete_approvals_for_deliverables,
        _create_or_sync_approval_workflow=_create_or_sync_approval_workflow,
        reconcile_stage_after_edit=reconcile_stage_after_edit,
        _rollback_deliverable_batch=_rollback_deliverable_batch,
        _persist_deliverable_batch=_persist_deliverable_batch,
        _notify_stage_handoff=_notify_stage_handoff,
        _notify_new_project_safely=_notify_new_project_safely,
        _notify_new_project=_notify_new_project,
        _keyed_lock=_keyed_lock,
        _get_approval_workflow=_get_approval_workflow,
        _fire_and_forget=_fire_and_forget,
        _complete_approval_workflow=_complete_approval_workflow,
        _build_deliverable_batch=_build_deliverable_batch,
        User=User,
        STAGE_STATUSES=STAGE_STATUSES,
        STAGES=STAGES,
        DELIVERABLE_TYPES=DELIVERABLE_TYPES,
        BulkProjectIdsPayload=BulkProjectIdsPayload,
        APPROVAL_TYPES=APPROVAL_TYPES,
        DeliverableUpdate=DeliverableUpdate,
        DeliverableCreate=DeliverableCreate,
    )
)

api_router.include_router(
    create_approvals_router(
        db=db,
        get_acting_user=get_acting_user,
        require_admin=require_admin,
        log_activity=log_activity,
        cached_read=cached_read,
        logger=logging.getLogger(__name__),
        require_approver=require_approver,
        _approvals_view_all=_approvals_view_all,
        _approval_item_can_act=_approval_item_can_act,
        _member_can_view_approval=_member_can_view_approval,
        _hydrate_approval_items=_hydrate_approval_items,
        _create_or_sync_approval_workflow=_create_or_sync_approval_workflow,
        _get_approval_workflow=_get_approval_workflow,
        _notify_stage_handoff_safe=_notify_stage_handoff_safe,
        BulkApprovalItemIdsPayload=BulkApprovalItemIdsPayload,
        ApprovalDecision=ApprovalDecision,
        APPROVAL_TYPES=APPROVAL_TYPES,
        ANY_MANAGER_APPROVAL_TYPES=ANY_MANAGER_APPROVAL_TYPES,
        next_selected_stage=next_selected_stage,
        _set_approval_items_pending=_set_approval_items_pending,
        _member_approval_stage=_member_approval_stage,
        _fire_and_forget=_fire_and_forget,
        _complete_approval_workflow=_complete_approval_workflow,
        ApprovalWorkflowCreate=ApprovalWorkflowCreate,
        ApprovalMove=ApprovalMove,
        User=User,
        now_iso=now_iso,
    )
)

api_router.include_router(
    create_work_items_router(
        db=db,
        logger=logging.getLogger(__name__),
        get_acting_user=get_acting_user,
        log_activity=log_activity,
        now_iso=now_iso,
        WorkItem=WorkItem,
        WorkItemUpdate=WorkItemUpdate,
        WorkItemCreate=WorkItemCreate,
        BulkUpdatePayload=BulkUpdatePayload,
        BulkDeletePayload=BulkDeletePayload,
        BulkCreatePayload=BulkCreatePayload,
        scoped_update_fields=scoped_update_fields,
        get_user_department=get_user_department,
        get_user_role=get_user_role,
        collab_fingerprint=collab_fingerprint,
        collab_key=collab_key,
        collab_row_has_identity=collab_row_has_identity,
        COLLAB_MAX_ROWS=COLLAB_MAX_ROWS,
        COLLAB_MAX_PEOPLE=COLLAB_MAX_PEOPLE,
        COLLAB_NO_IDENTITY_MESSAGE=COLLAB_NO_IDENTITY_MESSAGE,
        cached_read=cached_read,
        apply_time_rules=apply_time_rules,
        _notify_admins_deliverable_missing=_notify_admins_deliverable_missing,
        _lookup_cache=_lookup_cache,
        MAX_UNIT_ROWS=MAX_UNIT_ROWS,
        DEPARTMENT_TO_STAGE=DEPARTMENT_TO_STAGE,
        validate_work_date=validate_work_date,
        validate_deliverable_ids=validate_deliverable_ids,
        search_clauses=search_clauses,
        is_multi_deliverable_row=is_multi_deliverable_row,
        get_time_benchmark=get_time_benchmark,
        can_user_create_stage=can_user_create_stage,
        apply_quantity_rules=apply_quantity_rules,
        _upsert_notifications_batch=_upsert_notifications_batch,
        _clean_ids=_clean_ids,
        UNIT_ROWS_DEPARTMENT=UNIT_ROWS_DEPARTMENT,
        DONE_STATUSES=DONE_STATUSES,
        DELIVERABLE_TYPE_UNITS=DELIVERABLE_TYPE_UNITS,
    )
)

api_router.include_router(
    create_auth_router(
        db=db,
        verify_password=verify_password,
        hash_password=hash_password,
        get_acting_user=get_acting_user,
        create_access_token=create_access_token,
        _record_login_failure=_record_login_failure,
        _login_fails=_login_fails,
        _invalidate_cached_user=_invalidate_cached_user,
        _client_ip=_client_ip,
        _check_login_throttle=_check_login_throttle,
        LoginPayload=LoginPayload,
        LoginResponse=LoginResponse,
        User=User,
        ACCESS_TOKEN_HOURS=ACCESS_TOKEN_HOURS,
    )
)

async def migrate_client_contacts():
    """
    Ensure all clients use the contact_persons structure
    and that every contact has a stable ID.

    Safe to run multiple times.
    """
    clients = await db.clients.find(
        {},
        {"_id": 0}
    ).to_list(1000)

    for client in clients:
        existing_contacts = client.get("contact_persons") or []

        # Existing contact_persons may have been imported without IDs.
        # Add IDs only where they are missing.
        if existing_contacts:
            normalized_contacts = []
            changed = False

            for contact in existing_contacts:
                normalized_contact = dict(contact)

                if not normalized_contact.get("id"):
                    normalized_contact["id"] = (
                        f"contact-{uuid.uuid4().hex[:8]}"
                    )
                    changed = True

                normalized_contacts.append(normalized_contact)

            if changed:
                await db.clients.update_one(
                    {"id": client["id"]},
                    {
                        "$set": {
                            "contact_persons": normalized_contacts
                        }
                    }
                )

            continue

        # Legacy single-contact field.
        legacy_contact = (
            client.get("contact_person") or ""
        ).strip()

        if not legacy_contact:
            continue

        contact = {
            "id": f"contact-{uuid.uuid4().hex[:8]}",
            "name": legacy_contact,
            "email": "",
            "phone": "",
            "designation": "",
        }

        await db.clients.update_one(
            {"id": client["id"]},
            {
                "$set": {
                    "contact_persons": [contact]
                }
            }
        )


api_router.include_router(
    create_dashboard_router(
        db=db,
        DONE_STATUSES=DONE_STATUSES,
        NON_TEAM_ROLES=NON_TEAM_ROLES,
        PROJECT_STATUSES=PROJECT_STATUSES,
        STAGES=STAGES,
        STATUSES=STATUSES,
        _valid_minutes=_valid_minutes,
        cached_read=cached_read,
        require_admin=require_admin,
    )
)

api_router.include_router(
    create_notification_router(
        db=db,
        DELIVERABLE_TYPE_CATEGORIES=DELIVERABLE_TYPE_CATEGORIES,
        DEPARTMENT_TO_STAGE=DEPARTMENT_TO_STAGE,
        WorkItem=WorkItem,
        _APPROVAL_NOTICE_QUERY=_APPROVAL_NOTICE_QUERY,
        _start_notification_scans=_start_notification_scans,
        can_user_create_stage=can_user_create_stage,
        get_acting_user=get_acting_user,
        get_time_benchmark=get_time_benchmark,
        now_iso=now_iso,
        validate_work_category_rules=validate_work_category_rules,
    )
)

api_router.include_router(
    create_lookups_router(
        db=db,
        APPROVAL_TYPES=APPROVAL_TYPES,
        CLIENT_STATUSES=CLIENT_STATUSES,
        DELIVERABLE_TYPES=DELIVERABLE_TYPES,
        DELIVERABLE_TYPE_CATEGORIES=DELIVERABLE_TYPE_CATEGORIES,
        DELIVERABLE_TYPE_UNITS=DELIVERABLE_TYPE_UNITS,
        DEPARTMENTS=DEPARTMENTS,
        MEMBER_FORWARD_STATUSES=MEMBER_FORWARD_STATUSES,
        PROJECT_STATUSES=PROJECT_STATUSES,
        ROLES=ROLES,
        STAGES=STAGES,
        STAGE_STATUSES=STAGE_STATUSES,
        STATUSES=STATUSES,
        WORK_CATEGORIES=WORK_CATEGORIES,
        get_acting_user=get_acting_user,
    )
)

_planning_router = create_planning_router(
    db=db,
    get_acting_user=get_acting_user,
    create_work_item=create_work_item,
    create_work_item_for_user_id=_create_work_item_for_user_id,
    create_work_item_for_task=_create_work_item_for_task,
    work_item_create_model=WorkItemCreate,
    department_to_stage=DEPARTMENT_TO_STAGE,
    deliverable_type_categories=DELIVERABLE_TYPE_CATEGORIES,
    upsert_notification=_upsert_notification,
    now_iso=now_iso,
    log_error=lambda message: logging.getLogger(__name__).warning(message),
)
api_router.include_router(_planning_router)

# Background sweeps. Task cards nobody answers within the hour are accepted for
# the person (the sweep lives in planning.py); Bulk Review rows a manager never
# got to are approved after 24 hours (auto_close_stale_reviews), and open rows
# (any status but On Hold) untouched for 2 hours are closed (auto_close_stale_rows). The loop runs the
# first every minute and the other two every fifth minute.
_auto_accept_due = _planning_router.auto_accept_due
_AUTO_ACCEPT_SWEEP_SECONDS = 60
_REVIEW_SWEEP_EVERY_N_TICKS = 5
_auto_accept_task: Optional["asyncio.Task"] = None


async def _auto_accept_loop():
    tick = 0
    while True:
        try:
            accepted = await _auto_accept_due()
            if accepted:
                logger.info("Auto-accepted %d unanswered task card(s)", accepted)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Auto-accept sweep failed")

        if tick % _REVIEW_SWEEP_EVERY_N_TICKS == 0:
            try:
                closed = await auto_close_stale_reviews()
                if closed:
                    logger.info("Auto-closed %d review(s) not reviewed in time", closed)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Auto-close of stale reviews failed")

            try:
                closed = await auto_close_stale_rows()
                if closed:
                    logger.info("Auto-closed %d row(s) untouched for %g hours", closed, STALE_ROW_AUTO_CLOSE_HOURS)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Auto-close of stale rows failed")

            try:
                done = await auto_close_stale_project_tasks()
                if done:
                    logger.info("Auto-closed %d Management task(s) untouched for %g hours", done, MGMT_TASK_AUTO_CLOSE_HOURS)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Auto-close of stale Management tasks failed")

        tick += 1
        await asyncio.sleep(_AUTO_ACCEPT_SWEEP_SECONDS)

# Share a project as a link with a WhatsApp preview (public read-only page).
api_router.include_router(
    create_project_share_router(
        db=db,
        get_acting_user=get_acting_user,
        now_iso=now_iso,
    )
)

api_router.include_router(
    create_home_dashboard_router(
        db=db,
        require_admin=require_admin,
        cached_read=cached_read,
        deliverable_required_for=deliverable_required_for,
        time_gated_statuses=TIME_GATED_STATUSES,
    )
)

# Projects team task sheet (Work Sheet > Projects tab). Its own collections;
# never part of work items or efficiency.
api_router.include_router(
    create_project_tasks_router(
        db=db,
        get_acting_user=get_acting_user,
        now_iso=now_iso,
    )
)

# Meetings: three company Google Calendars, synced every 10 minutes.
_meetings_router = create_meetings_router(
    db=db,
    get_acting_user=get_acting_user,
    now_iso=now_iso,
)
api_router.include_router(_meetings_router)
_calendar_sync_task: Optional["asyncio.Task"] = None

app.include_router(api_router)

@app.middleware("http")
async def server_timing_middleware(request: Request, call_next):
    """Time every request inside the app (handler + response validation, not
    network). Shown in Chrome DevTools > Network > Timing > "Server Timing", and
    anything slower than 800ms is written to the server log, so slow endpoints
    can be told apart from a slow network."""
    started = time.perf_counter()
    try:
        response = await call_next(request)
    finally:
        # Any request that may have written data drops the read cache, so the
        # person who just changed something never reads a stale count back.
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            read_cache.bump()
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.0f}"
    # Bandwidth diagnostics: content-length here is the size BEFORE gzip, so
    # anything over ~300KB is a candidate for the outbound-bandwidth spikes.
    # Search the Render logs for "BIG RESPONSE" to see which endpoints send most.
    try:
        size = int(response.headers.get("content-length", 0))
    except ValueError:
        size = 0
    if size > 300_000 and request.method != "OPTIONS":
        logger.warning(
            "BIG RESPONSE %s %s %.0fKB", request.method, request.url.path, size / 1024
        )
    if elapsed_ms > 800 and request.method != "OPTIONS":
        logger.warning(
            "SLOW REQUEST %s %s %.0fms status=%s",
            request.method, request.url.path, elapsed_ms, response.status_code,
        )
    return response


# JSON compresses roughly 5-10x. On a long-latency link (India -> the API host)
# the download time of the bigger responses (work items, projects) is a real
# part of the page-load time.
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Cookies are sent cross-site (SameSite=None), so CORS must name the real
# frontend origin(s). Starlette answers a wildcard by echoing back whichever
# origin sent a cookie, which would let any website call the API as the user.
# CORS_ORIGINS wins; otherwise FRONTEND_URL (already required for reset links);
# the wildcard is only the last resort and is logged loudly.
_cors_raw = os.environ.get("CORS_ORIGINS") or os.environ.get("FRONTEND_URL") or "*"
_cors_origins = [o.strip().rstrip("/") for o in _cors_raw.split(",") if o.strip()] or ["*"]
_cors_wildcard = "*" in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
if _cors_wildcard:
    logger.warning(
        "CORS is open to every origin with credentials. Set CORS_ORIGINS to the "
        "frontend address(es), e.g. https://your-app.vercel.app"
    )


async def migrate_project_kanban_order():
    """Backfill persistent Kanban order for projects created before ordering existed."""
    projects = await db.projects.find(
        {},
        {"_id": 0, "id": 1, "status": 1, "kanban_order": 1, "created_at": 1},
    ).sort([("created_at", -1)]).to_list(5000)

    grouped = {}
    for project in projects:
        grouped.setdefault(project.get("status") or "Active", []).append(project)

    for status, rows in grouped.items():
        existing = [row for row in rows if row.get("kanban_order") is not None]
        missing = [row for row in rows if row.get("kanban_order") is None]
        existing.sort(key=lambda row: row.get("kanban_order", 0))
        # The original query is newest-first, so missing orders naturally
        # inherit the historical newest-first ordering.
        rows = existing + missing

        for index, row in enumerate(rows):
            if row.get("kanban_order") is None:
                await db.projects.update_one(
                    {"id": row["id"]},
                    {"$set": {"kanban_order": index}},
                )


async def migrate_admin_only_notifications():
    """Project-level status/timeline management and adding deliverables are
    both admin-only actions, but earlier notification logic sent the
    project-level 'delayed_deadline' notice and the no-deliverables-yet
    'new_project' notice to production staff, who had no way to act on
    either. Remove any such notifications already delivered to non-admin
    users before this fix landed; going forward, _notify_new_project and
    _ensure_overdue_notifications only target admins for these two cases."""
    non_admin_ids = [
        u["id"]
        for u in await db.users.find(
            {"role": {"$nin": NON_TEAM_ROLES}}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]
    if not non_admin_ids:
        return

    await db.notifications.delete_many({
        "user_id": {"$in": non_admin_ids},
        "deliverable_id": None,
        "type": {"$in": ["delayed_deadline", "new_project"]},
    })


async def migrate_manager_only_approval_notifications():
    """Approval notices ("<stage> approval ready", "Ready for <stage>", the
    per-deliverable "ready for <stage>" notice) mean something only to a
    manager. Remove the ones already delivered to anyone else. Idempotent;
    going forward they are only created for managers."""
    other_ids = [
        u["id"]
        for u in await db.users.find(
            {"role": {"$ne": "manager"}}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]
    if not other_ids:
        return

    result = await db.notifications.delete_many({
        "user_id": {"$in": other_ids},
        **_APPROVAL_NOTICE_QUERY,
    })
    if result.deleted_count:
        logger.info(
            "Removed %d approval notifications from non-manager queues",
            result.deleted_count,
        )


async def migrate_orphan_approvals():
    """Remove approval workflows/items (and their notifications) whose
    deliverable no longer exists - left behind by deliverables deleted before
    deletes cascaded. Idempotent. Skipped when there are no deliverables at
    all, so a wrong/empty database can never trigger a mass delete."""
    live_ids = set(await db.deliverables.distinct("id"))
    if not live_ids:
        return

    referenced = set(await db.approval_items.distinct("deliverable_id"))
    referenced.update(await db.approval_workflows.distinct("deliverable_id"))
    orphan_ids = [d for d in referenced if d and d not in live_ids]
    if not orphan_ids:
        return

    await _delete_approvals_for_deliverables(orphan_ids)
    logger.info(
        "Removed approvals/notifications for %d deleted deliverables", len(orphan_ids)
    )


@app.on_event("startup")
async def run_startup_migrations():
    await migrate_client_contacts()
    await migrate_project_kanban_order()
    await migrate_admin_only_notifications()
    await migrate_manager_only_approval_notifications()
    await migrate_orphan_approvals()
    global _auto_accept_task
    if _auto_accept_task is None or _auto_accept_task.done():
        _auto_accept_task = asyncio.create_task(_auto_accept_loop())
    global _calendar_sync_task
    if _calendar_sync_task is None or _calendar_sync_task.done():
        _calendar_sync_task = asyncio.create_task(calendar_sync_loop(_meetings_router.sync_all, _meetings_router.ensure_watches))
    # Load firebase-admin in a worker thread now, so the first push doesn't
    # stall a request while the (slow) import runs.
    _fire_and_forget(asyncio.to_thread(_get_firebase_app))
    # Almost every lookup in this app is by the string field `id` (not Mongo's
    # own `_id`), and none of those fields were indexed - so each find_one /
    # update_one by id scanned its whole collection. That includes the
    # per-request user lookup in get_acting_user, and every project, client
    # and deliverable lookup. Non-unique on purpose: this must never fail
    # startup on a database that already holds an odd duplicate.
    await db.users.create_index("id")
    await ensure_project_task_indexes(db)
    await ensure_meeting_indexes(db)
    await db.clients.create_index("id")
    await db.projects.create_index("id")
    await db.projects.create_index("code")
    # The duplicate-name check on project creation reads one client's projects.
    await db.projects.create_index("client_id")
    await db.deliverables.create_index("id")
    await db.projects.create_index([("status", 1), ("kanban_order", 1)])
    # Speeds up the overdue-deadline scan in _ensure_overdue_notifications,
    # which range-queries on these date fields every ~60s.
    await db.projects.create_index([("end_date", 1)])
    await db.deliverables.create_index([("end_dt", 1)])
    await db.deliverables.create_index([("project_id", 1)])
    # The sidebar's Approvals badge looks up "Ready for Review" deliverables
    # (newest first) on every poll.
    await db.deliverables.create_index([("stage_status", 1), ("updated_at", -1)])
    # GET /projects sorts on this.
    await db.projects.create_index([("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.notifications.create_index(
        [("user_id", 1), ("dedupe_key", 1)],
        unique=True,
    )
    await db.notifications.create_index([("user_id", 1), ("read_at", 1)])
    await db.push_tokens.create_index("token", unique=True)
    await db.push_tokens.create_index("user_id")
    await db.approval_workflows.create_index("deliverable_id", unique=True)
    await db.approval_items.create_index([("approval_workflow_id", 1), ("approval_type", 1)], unique=True)
    await db.approval_items.create_index([("status", 1), ("approval_type", 1), ("assigned_to", 1)])
    await db.approval_items.create_index([("status", 1), ("approval_type", 1)])
    await db.approval_items.create_index([("status", 1), ("assigned_to", 1)])
    await db.approval_items.create_index([("approval_workflow_id", 1)])
    await db.approval_items.create_index([("deliverable_id", 1)])
    await db.approval_history.create_index([("deliverable_id", 1), ("created_at", -1)])

    # work_items never got the same id-index treatment as every collection
    # above, despite being the largest and most frequently queried one in
    # the app — every get/update/delete-by-id call here was a full
    # collection scan, and it only gets more expensive as rows accumulate.
    await db.work_items.create_index("id")
    # Matches list_work_items' default sort exactly, so the worksheet's
    # main fetch (and its limit= fast-slice) can use the index to satisfy
    # the sort instead of loading everything into memory to sort it.
    await db.work_items.create_index([("work_date", -1), ("created_at", -1)])
    # Matches the sidebar's pending-count badge, polled every 5s from
    # every open session regardless of which page is active.
    await db.work_items.create_index([("status", 1), ("stage", 1)])
    # Matches the Bulk Review badge/list (status="Ready for Review",
    # optionally scoped to a specific reviewer_id).
    await db.work_items.create_index([("status", 1), ("reviewer_id", 1)])
    # Optional filters on the main list endpoint and various stats/lookup
    # queries elsewhere.
    await db.work_items.create_index([("creator_id", 1)])
    await db.work_items.create_index([("reviewer_id", 1)])
    await db.work_items.create_index([("project_id", 1)])
    await db.work_items.create_index([("deliverable_id", 1)])
    await db.work_items.create_index([("month", 1)])
    # One Work Sheet row per accepted WhatsApp task. Partial, so every row that
    # did not come from a task is ignored. If old data already holds a duplicate
    # the index cannot build; that is logged and start-up carries on, and the
    # code path still checks source_task_id before inserting.
    try:
        await db.work_items.create_index(
            "source_task_id",
            unique=True,
            partialFilterExpression={"source_task_id": {"$type": "string"}},
        )
    except Exception:
        logger.exception("Could not create the unique source_task_id index (duplicates already exist?)")
    # Collaborators: one row per (person, piece of work). The partial unique
    # index is what makes tagging idempotent when two requests race - rows
    # that are not collaborator copies have no collab_key and are not covered.
    try:
        await db.work_items.create_index(
            "collab_key",
            unique=True,
            partialFilterExpression={"collab_key": {"$type": "string"}},
        )
        await db.work_items.create_index(
            "collab_group_id",
            partialFilterExpression={"collab_group_id": {"$type": "string"}},
        )
    except Exception:
        # Never block start-up; the endpoint still de-duplicates in code.
        logger.exception("Could not create the collaborator indexes")


@app.on_event("shutdown")
async def shutdown_db_client():
    if _auto_accept_task is not None and not _auto_accept_task.done():
        _auto_accept_task.cancel()
    client.close()