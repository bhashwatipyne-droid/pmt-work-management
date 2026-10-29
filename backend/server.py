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
        _expire_old_notifications,
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
    from security import (  # noqa: F401
        LOGIN_MAX_FAILS_PER_LOGIN,
        LOGIN_MAX_FAILS_PER_IP,
        LOGIN_FAIL_WINDOW_SECONDS,
        _login_fails,
        _client_ip,
        _recent_fails,
        _check_login_throttle,
        _record_login_failure,
    )
    from models import (  # noqa: F401
        DeliverableCreate,
        DeliverableUpdate,
        ApprovalWorkflowCreate,
        ApprovalDecision,
        ApprovalMove,
        BulkApprovalItemIdsPayload,
    )
    from approval_helpers import (  # noqa: F401
        _approval_item_can_act,
        _complete_approval_workflow,
        _create_or_sync_approval_workflow,
        _delete_approvals_for_deliverables,
        _get_approval_workflow,
        _hydrate_approval_items,
        _new_approval_item,
        _new_approval_workflow,
        _normalize_approval_types,
        _notify_stage_handoff,
        _notify_stage_handoff_safe,
        _set_approval_items_pending,
    )
    from project_helpers import (  # noqa: F401
        _build_deliverable_batch,
        _generate_unique_project_code,
        _hydrate_project,
        _hydrate_projects,
        _move_project_to_status,
        _notify_new_project_safely,
        _persist_deliverable_batch,
        _place_new_project_at_top,
        _project_code_exists_query,
        _projects_touched_since,
        _reindex_project_status,
        _rollback_deliverable_batch,
        _rollback_new_project,
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
        _expire_old_notifications,
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
    from backend.security import (  # noqa: F401
        LOGIN_MAX_FAILS_PER_LOGIN,
        LOGIN_MAX_FAILS_PER_IP,
        LOGIN_FAIL_WINDOW_SECONDS,
        _login_fails,
        _client_ip,
        _recent_fails,
        _check_login_throttle,
        _record_login_failure,
    )
    from backend.models import (  # noqa: F401
        DeliverableCreate,
        DeliverableUpdate,
        ApprovalWorkflowCreate,
        ApprovalDecision,
        ApprovalMove,
        BulkApprovalItemIdsPayload,
    )
    from backend.approval_helpers import (  # noqa: F401
        _approval_item_can_act,
        _complete_approval_workflow,
        _create_or_sync_approval_workflow,
        _delete_approvals_for_deliverables,
        _get_approval_workflow,
        _hydrate_approval_items,
        _new_approval_item,
        _new_approval_workflow,
        _normalize_approval_types,
        _notify_stage_handoff,
        _notify_stage_handoff_safe,
        _set_approval_items_pending,
    )
    from backend.project_helpers import (  # noqa: F401
        _build_deliverable_batch,
        _generate_unique_project_code,
        _hydrate_project,
        _hydrate_projects,
        _move_project_to_status,
        _notify_new_project_safely,
        _persist_deliverable_batch,
        _place_new_project_at_top,
        _project_code_exists_query,
        _projects_touched_since,
        _reindex_project_status,
        _rollback_deliverable_batch,
        _rollback_new_project,
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
    await _expire_old_notifications()


def _start_notification_scans():
    """Kick off the scans without making the caller wait for them (a scan
    that is already running is left alone; each scan also throttles itself)."""
    global _notification_scan_task
    if _notification_scan_task is not None and not _notification_scan_task.done():
        return
    _notification_scan_task = asyncio.create_task(_run_notification_scans())


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

_work_items_router = create_work_items_router(
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
api_router.include_router(_work_items_router)

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
    add_collaborators=_work_items_router.add_collaborators,
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

# Premium Content planner sheet -> PMT deliverables (Apps Script pushes rows;
# secured by the SHEET_SYNC_TOKEN env var, not a user login).
try:
    from premium_sheet_sync import create_premium_sheet_router
except ImportError:  # run as backend.server from the repo root
    from backend.premium_sheet_sync import create_premium_sheet_router
api_router.include_router(create_premium_sheet_router())
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
    # The daily expiry (notifications._expire_old_notifications) filters on age.
    await db.notifications.create_index([("created_at", 1)])
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