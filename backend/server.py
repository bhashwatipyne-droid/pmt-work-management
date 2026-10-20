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

# ---------------- Constants ----------------
DELIVERABLE_TYPES = [
    # Core
    "Other Initiatives",
    "Client Meets & Discussions",
    "Team Reviews and Feedback",
    "Campaign Ideation Plan (Includes Keywords)",
    "Campaign Ideation Plan (Quantitative Analysis)",
    "Campaign Ideation Plan (Content Peer Analysis)",
    "Campaign Ideation Plan (Key Visuals / Taglines)",
    "Teaser",
    "Minimalist",
    "Emailers",
    "Newsletters",
    "Carousel",
    "One Pager / Infographic",
    "Brochure",
    "Booklet",
    "Presentation (PPT) - Per Slide",
    "Typeform / Polls / Quiz",
    "Collateral",
    "GIF",
    "Reel / Short Video",
    "Long Video",
    "Video Storyboard",
    "Poster",
    "Data Research and Analysis (SMI)",
    "Data Research and Analysis (Web)",
    "Data Updation",
    "Changes",
    "Two Pager",
    "Teaser Short Video",

    # Non-Core
    "Project Briefing",
    "Campaign Ideation Discussions",
    "Clarity / Query / Doubt / Feedback Discussions",
    "Core Team / Content Team / CEO Discussions",
    "Trainings / Committee / Reviews Meetings",
    "SOP and Process Improvements - Documentation",
    "Hiring and Interviews",
    "Follow Up (Over 10-15 mins)",
]

WORK_CATEGORIES = ["Core", "Non-Core"]

# Deliverable types that are measured one unit at a time (the "Activity
# Potential" unit basis). Value = what one unit is called; the Work Sheet's Qty
# column uses it to say "23 slides" / "4 pages" (Animate rows always count
# scenes instead). The older "one row per unit" endpoint reads it too.
DELIVERABLE_TYPE_UNITS = {
    "Presentation (PPT) - Per Slide": "Slide",
    "Carousel": "Slide",
    "Reel / Short Video": "Reel",
    "Booklet": "Page",
    "Brochure": "Page",
    "Two Pager": "Page",
    "Video Storyboard": "Frame",
    "Teaser": "Video",
    "Teaser Short Video": "Video",
    "Long Video": "Video",
    "Poster": "Post",
    "Minimalist": "Post",
    "GIF": "GIF",
}
MAX_UNIT_ROWS = 100
# Only this department gets the per-unit editor (members and managers).
UNIT_ROWS_DEPARTMENT = "Design"

STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Changes Requested", "Rework", "Closed", "Scrap"]
# "On Hold" is a pause a member can set on their own row (e.g. waiting on a
# client), same as Ongoing/Ready for Review - it does not need a reviewer.
# "Scrap" is work thrown away; the row's owner can set it without a review.
MEMBER_FORWARD_STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Scrap"]
PROJECT_STATUSES = [
    "Active",
    "Approval Pending",
    "Completed",
    "Ready for Invoice",
    "Raised Invoice",
    "On Hold",
    "Scrapped",
]
# How many projects one list call may return. The Projects board, the Work
# Sheet pickers and the command palette all want the whole portfolio; a low
# default (it used to be 100) silently hid every project past the newest 100.
PROJECT_LIST_LIMIT = 5000


def search_clauses(search: str, fields: List[str]) -> List[dict]:
    """Forgiving text search: one clause per word typed, each of which must
    match one of `fields`. Punctuation and spacing in the query are ignored,
    and the words may sit apart in the stored text, so "absl -spl" finds
    "ABSL - SPL Campaign". Returns [] when the query has no searchable words."""
    words = re.findall(r"\w+", search or "", re.UNICODE)[:8]
    return [
        {"$or": [{f: {"$regex": re.escape(w), "$options": "i"}} for f in fields]}
        for w in words
    ]


STAGE_STATUSES = ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"]
DEPARTMENTS = ["Content", "Design", "Animation", "Administration"]
# "hr" (Finance) is its own role, separate from admin, manager and member: it only
# sees the invoicing screens (see HR_ALLOWED_PREFIXES) and is not part of the
# production team, so it is left out of team, efficiency and workload lists.
ROLES = ["admin", "manager", "member", "hr"]
HR_ALLOWED_PREFIXES = (
    "/api/auth/",
    "/api/invoicing/",
    "/api/notifications",
    "/api/push/",
    "/api/config/",
)
APPROVAL_TYPES = ["MANAGER", "LEADERSHIP", "CLIENT_SPOC", "COMPLIANCE"]
APPROVAL_STATUSES = ["NOT_STARTED", "PENDING", "APPROVED", "CHANGES_REQUESTED"]

# ---------------- Models ----------------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    username: Optional[str] = ""
    role: str
    email: Optional[str] = ""
    department: Optional[str] = ""
    active: Optional[bool] = True


class UserCreate(BaseModel):
    name: str
    username: str
    email: str
    password: str
    role: str
    department: Optional[str] = ""
    active: Optional[bool] = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    department: Optional[str] = None
    active: Optional[bool] = None


class WorkItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    work_date: str
    month: str
    deliverable_name: str = ""
    deliverable_type: str = ""
    deliverable_link: str = ""
    work_category: str = "Core"
    version: str = ""
    time_taken_minutes: float = 0
    # Where time_taken_minutes came from. "auto" = filled from the worker's
    # own benchmark (efficiency_employee_targets.time_per_unit_minutes) for the
    # chosen deliverable type; "manual" = typed by a person. Server-managed:
    # clients cannot set it (it is not in WorkItemCreate/WorkItemUpdate).
    time_source: str = "manual"
    # The benchmark that applied when the type was chosen, kept so the UI can
    # show how far an edited time is from it. None = no benchmark exists.
    time_benchmark_minutes: Optional[float] = None
    # Design/Animate rows: how many units (slides, pages, scenes...) this one
    # row covers, e.g. 23 for a 23-slide deck. Efficiency counts it for Closed
    # rows. Always 1 for any other stage.
    quantity: float = 1.0
    # Minutes per unit, in order (None = not logged yet). Empty when the row
    # has no per-unit breakdown. When any is logged, time_taken_minutes is
    # their total (see apply_quantity_rules).
    quantity_items: List[Optional[float]] = Field(default_factory=list)
    # Campaign Ideation Plan rows (Content) only: every deliverable of the row's
    # project that this one row covers, in the order they were ticked.
    # deliverable_id is always the first; quantity is the number of
    # deliverables and quantity_items[i] is the time for deliverable_ids[i]
    # (see apply_deliverable_list_rules). Empty on every other row.
    deliverable_ids: List[str] = Field(default_factory=list)
    # Animate rows only: length of the finished video. SECONDS are the source
    # of truth; the minutes field is kept in step (seconds / 60) for older
    # readers and rows saved before seconds existed (see the validator below).
    video_duration_seconds: Optional[int] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    # True when the user picked "Not available" in the Deliverable dropdown
    # (the project has no matching deliverable yet). Kept separate from
    # deliverable_id so every existing join on deliverable_id keeps working.
    deliverable_not_available: bool = False
    stage: Optional[str] = None
    remarks: str = ""
    status: str = "Not Started"
    # Collaborators: when one person tags teammates on an entry, each teammate
    # gets their own row (own time, own status) and every row of that entry
    # shares collab_group_id. Server-managed - clients cannot set these.
    collab_group_id: Optional[str] = None
    collab_source_id: Optional[str] = None  # the row this copy was made from
    collab_added_by: Optional[str] = None  # user who tagged this person
    created_at: str
    updated_at: str

    @model_validator(mode="after")
    def _fill_video_duration_seconds(self):
        # Rows saved before seconds existed only carry minutes.
        if self.video_duration_seconds is None and self.video_duration_minutes is not None:
            self.video_duration_seconds = int(round(self.video_duration_minutes * 60))
        return self


class WorkItemCreate(BaseModel):
    work_date: Optional[str] = None
    deliverable_name: Optional[str] = ""
    deliverable_type: Optional[str] = ""
    deliverable_link: Optional[str] = ""
    work_category: Optional[str] = "Core"
    version: Optional[str] = ""
    time_taken_minutes: Optional[float] = 0
    quantity: Optional[float] = 1.0
    quantity_items: Optional[List[Optional[float]]] = None
    deliverable_ids: Optional[List[str]] = None
    video_duration_seconds: Optional[float] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    deliverable_not_available: Optional[bool] = False
    stage: Optional[str] = None
    remarks: Optional[str] = ""
    status: Optional[str] = "Not Started"


class WorkItemUpdate(BaseModel):
    work_date: Optional[str] = None
    deliverable_name: Optional[str] = None
    deliverable_type: Optional[str] = None
    deliverable_link: Optional[str] = None
    work_category: Optional[str] = None
    version: Optional[str] = None
    time_taken_minutes: Optional[float] = None
    quantity: Optional[float] = None
    quantity_items: Optional[List[Optional[float]]] = None
    deliverable_ids: Optional[List[str]] = None
    video_duration_seconds: Optional[float] = None
    video_duration_minutes: Optional[float] = None
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
    deliverable_not_available: Optional[bool] = None
    stage: Optional[str] = None
    remarks: Optional[str] = None
    status: Optional[str] = None


class BulkUpdatePayload(BaseModel):
    ids: List[str]
    patch: WorkItemUpdate


class BulkDeletePayload(BaseModel):
    ids: List[str]


class BulkCreatePayload(BaseModel):
    count: int = 100
    template: Optional[WorkItemCreate] = None


class BulkProjectIdsPayload(BaseModel):
    project_ids: List[str]


class BulkProjectStatusPayload(BaseModel):
    project_ids: List[str]
    status: str


class ProjectReorderPayload(BaseModel):
    project_id: str
    target_status: str
    target_index: int = 0


class DeliverableInput(BaseModel):
    name: str
    type: Optional[str] = ""
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    # Per-stage deadline windows, e.g. {"Content": {"start_dt": "2026-09-22",
    # "end_dt": "2026-09-24"}, "Design": {...}}. When given, this is what the
    # overall start_dt/end_dt above are derived from (see
    # derive_deliverable_dates) - a stage need not have an entry, in which
    # case that stage's deadline simply isn't tracked yet.
    stage_schedule: Optional[Dict[str, Dict[str, Optional[str]]]] = None
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    approval_types: Optional[List[str]] = None
    current_stage: Optional[str] = None


class ProjectCreate(BaseModel):
    name: str
    client_id: str
    # One line the team sees when picking the project on the Work Sheet,
    # e.g. "Oct 2026 edition, Gujarati versions" - tells similar projects apart.
    description: Optional[str] = ""
    # Selected contact person for this project
    poc_id: Optional[str] = None
    # Both dates are optional: a project can be created before its window is known.
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = "Active"
    deliverables: Optional[List[DeliverableInput]] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    description: Optional[str] = None
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: Optional[str] = None


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    client_id: str
    description: str = ""
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    status: str = "Active"

    # Kanban ordering. Lower values render first within a status column.
    kanban_order: int = 0
    status_changed_at: Optional[str] = None

    # Visibility
    hidden: bool = False
    hidden_at: Optional[str] = None
    hidden_by: Optional[str] = None

    created_at: str
    updated_at: str


class Deliverable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    name: str
    type: str = ""
    # Always derived from stage_schedule when it has any entries (see
    # derive_deliverable_dates) - not directly editable once a per-stage
    # window exists. Kept for sorting, the overdue-deadline job, and any
    # deliverable that only has the old-style single overall range.
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    # Per-stage deadline window: {"Content": {"start_dt": ..., "end_dt": ...}}.
    # A stage with no entry here has no tracked deadline.
    stage_schedule: Dict[str, Dict[str, Optional[str]]] = Field(default_factory=dict)
    required_stages: List[str] = Field(
        default_factory=lambda: ["Content"]
    )
    current_stage: str = "Content"
    stage_status: str = "Not Started"
    approval_types: List[str] = Field(default_factory=list)
    created_at: str
    updated_at: str


# ---------------- Auth helpers ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_HOURS)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


# ---------------- Helpers ----------------
# Every authenticated request used to start with a users.find_one round trip to
# the database. Repeated polls and page loads from the same person now reuse the
# document for a short time. Any write to the users collection below drops the
# entry, so the only lag is for changes made by another server instance
# (bounded by the TTL).
_USER_CACHE_TTL_SECONDS = 30
_user_cache: dict = {}


def _invalidate_cached_user(user_id: Optional[str] = None) -> None:
    if user_id is None:
        _user_cache.clear()
    else:
        _user_cache.pop(user_id, None)


async def get_acting_user(request: Request) -> User:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    user_id = payload["sub"]
    cached = _user_cache.get(user_id)
    if cached and cached[0] > time.monotonic():
        doc = cached[1]
    else:
        doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if doc:
            _user_cache[user_id] = (time.monotonic() + _USER_CACHE_TTL_SECONDS, doc)
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    if not doc.get("active", True):
        raise HTTPException(status_code=401, detail="Account deactivated")
    if doc.get("role") == "hr" and not request.url.path.startswith(HR_ALLOWED_PREFIXES):
        # HR works only in invoicing; keep every production endpoint closed to it.
        raise HTTPException(status_code=403, detail="HR accounts can only use invoicing")
    return User(**doc)


def _activity_doc(
    entity_id: str,
    action: str,
    changed_by: str,
    old_value=None,
    new_value=None,
    metadata=None,
    entity_field: str = "entity_id",
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        entity_field: entity_id,
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "changed_by": changed_by,
        "changed_at": now_iso(),
        "metadata": metadata or {},
    }


async def log_activity(
    collection_name: str,
    entity_id: str,
    action: str,
    changed_by: str,
    old_value=None,
    new_value=None,
    metadata=None,
    entity_field: str = "entity_id",
):
    activity = _activity_doc(
        entity_id,
        action,
        changed_by,
        old_value=old_value,
        new_value=new_value,
        metadata=metadata,
        entity_field=entity_field,
    )

    await db[collection_name].insert_one(activity)


def gen_project_code() -> str:
    return "proj" + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))



async def require_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


async def require_manager(request: Request) -> User:
    """Manager-only actions (approvals, efficiency capacity). Admins and members
    can open those screens read-only but cannot act."""
    user = await get_acting_user(request)
    if user.role != "manager":
        raise HTTPException(
            status_code=403,
            detail="Only managers can take this action"
        )
    return user


def _approvals_view_all(user: User) -> bool:
    """Admins and members see every pending approval. Admins can also act on
    them; members are read-only. Managers see the queue they can actually act
    on (see _approval_item_can_act)."""
    return user.role in ("admin", "member")


# Members of these departments only see approvals for deliverables currently
# in their own production stage (e.g. the Content team sees Content approvals
# only). Department -> stage.
MEMBER_APPROVAL_STAGE_SCOPE = {"Content": "Content"}


def _member_approval_stage(user: User) -> Optional[str]:
    """The only stage a member may see approvals for, or None if unscoped."""
    if user.role != "member":
        return None
    return MEMBER_APPROVAL_STAGE_SCOPE.get(user.department or "")


def _member_can_view_approval(user: User, deliverable: Optional[dict]) -> bool:
    stage = _member_approval_stage(user)
    if stage is None:
        return True
    return bool(deliverable) and deliverable.get("current_stage", "Content") == stage


async def require_approver(request: Request) -> User:
    """Approvals actions (approve, move, hide). Managers and admins
    may act; members stay read-only."""
    user = await get_acting_user(request)
    if user.role not in {"manager", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="Only managers and admins can take this action"
        )
    return user


async def require_manager_or_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role not in {"admin", "manager"}:
        raise HTTPException(
            status_code=403,
            detail="Manager or admin access required"
        )
    return user



def can_user_create_stage(user: User, stage: str) -> bool:
    if user.role == "admin":
        return False

    user_stage = DEPARTMENT_TO_STAGE.get(user.department)

    # Managers and members can create rows only for their own department.
    return bool(user_stage and stage == user_stage)


async def get_user_department(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "department": 1})
    return doc.get("department") if doc else None


async def get_user_role(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    return doc.get("role") if doc else None


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


@api_router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginPayload, request: Request, response: Response):
    login = payload.login.strip().lower()
    ip = _client_ip(request)
    _check_login_throttle(ip, login)
    doc = await db.users.find_one(
        {
            "$or": [
                {"username": login},
                {"email": login},
            ]
        },
        {"_id": 0},
    )
    if not doc or not verify_password(payload.password, doc.get("password_hash", "")):
        _record_login_failure(ip, login)
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not doc.get("active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
    _login_fails.pop(f"login:{ip}:{login}", None)
    token = create_access_token(doc["id"])
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=ACCESS_TOKEN_HOURS * 3600,
        path="/",
    )
    return LoginResponse(**doc, access_token=token)


# ---------------- Forgot / reset password ----------------
# A reset link is emailed to the address on the account. Only a hash of the
# token is stored, it works once and expires after RESET_TOKEN_MINUTES. The
# response to "forgot password" is always the same, so it never reveals whether
# a username or email exists.
#
# Email goes out over SMTP, configured with environment variables:
#   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_FROM,
#   SMTP_STARTTLS (true), and FRONTEND_URL (e.g. https://pmt.example.com) for
#   the link. Some hosts (Render's free plan) block SMTP; there, set
#   BREVO_API_KEY (and EMAIL_FROM = a sender verified in Brevo) to send over
#   HTTPS instead. With neither, nothing is sent: the link is logged.
RESET_TOKEN_MINUTES = 30
RESET_REQUEST_COOLDOWN_SECONDS = 60
PASSWORD_RESETS_PER_DAY = 2
FORGOT_PASSWORD_MESSAGE = (
    "If an account matches, a password reset link has been sent to its email address."
)


def _hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _send_email_sync(to_address: str, subject: str, body: str) -> None:
    host = os.environ.get("SMTP_HOST", "").strip()
    sender = os.environ.get("SMTP_FROM", "").strip() or os.environ.get("SMTP_USER", "").strip()
    message = EmailMessage()
    message["To"] = to_address
    message["From"] = sender
    message["Subject"] = subject
    message.set_content(body)

    port = int(os.environ.get("SMTP_PORT", "587"))
    starttls = os.environ.get("SMTP_STARTTLS", "true").strip().lower() != "false"
    with smtplib.SMTP(host, port, timeout=15) as smtp:
        if starttls:
            smtp.starttls()
        username = os.environ.get("SMTP_USER", "").strip()
        if username:
            smtp.login(username, os.environ.get("SMTP_PASSWORD", ""))
        smtp.send_message(message)


def _sender_parts() -> tuple:
    """(display name, address) of the "from" identity, from SMTP_FROM / EMAIL_FROM."""
    raw = (
        os.environ.get("EMAIL_FROM", "").strip()
        or os.environ.get("SMTP_FROM", "").strip()
        or os.environ.get("SMTP_USER", "").strip()
    )
    name, address = parseaddr(raw)
    return name or "PMT", address


async def _send_email_brevo(to_address: str, subject: str, body: str) -> None:
    """Send over Brevo's HTTPS API. Unlike SMTP this works on hosts that block
    outbound mail ports (Render's free plan does). Needs BREVO_API_KEY and a
    sender address verified in Brevo (EMAIL_FROM)."""
    import httpx

    name, address = _sender_parts()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={
                "api-key": os.environ["BREVO_API_KEY"].strip(),
                "accept": "application/json",
                "content-type": "application/json",
            },
            json={
                "sender": {"name": name, "email": address},
                "to": [{"email": to_address}],
                "subject": subject,
                "textContent": body,
            },
        )
        response.raise_for_status()


async def _deliver_email(to_address: str, subject: str, body: str, fallback_note: str = "") -> None:
    """Send with Brevo when BREVO_API_KEY is set, else SMTP when SMTP_HOST is
    set, else just log. Never raises - a failed send is logged."""
    try:
        if os.environ.get("BREVO_API_KEY", "").strip():
            await _send_email_brevo(to_address, subject, body)
        elif os.environ.get("SMTP_HOST", "").strip():
            await asyncio.to_thread(_send_email_sync, to_address, subject, body)
        else:
            logger.warning("No email provider configured (BREVO_API_KEY or SMTP_HOST). %s", fallback_note)
    except Exception:
        logger.exception("Could not send the email %r to %s", subject, to_address)


# Keeps references to in-flight background sends so they are not garbage-collected.
_background_sends: set = set()


class ForgotPasswordPayload(BaseModel):
    login: str


class ResetPasswordPayload(BaseModel):
    token: str
    new_password: str


@api_router.post("/auth/forgot-password")
async def forgot_password(payload: ForgotPasswordPayload, request: Request):
    login = payload.login.strip().lower()
    if not login:
        return {"message": FORGOT_PASSWORD_MESSAGE}

    doc = await db.users.find_one(
        {"$or": [{"username": login}, {"email": login}]},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "active": 1},
    )
    email = (doc or {}).get("email") or ""
    if not doc or not doc.get("active", True) or not email:
        return {"message": FORGOT_PASSWORD_MESSAGE}

    now = datetime.now(timezone.utc)
    recent = await db.password_resets.find_one(
        {
            "user_id": doc["id"],
            "created_at": {"$gt": (now - timedelta(seconds=RESET_REQUEST_COOLDOWN_SECONDS)).isoformat()},
        },
        {"_id": 0, "user_id": 1},
    )
    if recent:
        return {"message": FORGOT_PASSWORD_MESSAGE}

    token = secrets.token_urlsafe(32)
    await db.password_resets.delete_many({"user_id": doc["id"]})
    await db.password_resets.insert_one({
        "token_hash": _hash_reset_token(token),
        "user_id": doc["id"],
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(minutes=RESET_TOKEN_MINUTES)).isoformat(),
    })

    base = (os.environ.get("FRONTEND_URL", "") or request.headers.get("origin", "")).rstrip("/")
    link = f"{base}/?reset_token={token}"
    body = (
        f"Hi {doc.get('name') or ''},\n\n"
        "We received a request to reset your PMT password. Use the link below to choose a new one. "
        f"It works once and expires in {RESET_TOKEN_MINUTES} minutes.\n\n"
        f"{link}\n\n"
        "If you did not ask for this, you can ignore this email - your password has not changed."
    )

    # Sent in the background so the request answers at once (a slow or blocked
    # mail server must not leave the person waiting, or make the response time
    # reveal whether the account exists).
    task = asyncio.create_task(
        _deliver_email(
            email,
            "Reset your PMT password",
            body,
            fallback_note=f"Reset link for {email}: {link}",
        )
    )
    _background_sends.add(task)
    task.add_done_callback(_background_sends.discard)

    return {"message": FORGOT_PASSWORD_MESSAGE}


@api_router.post("/auth/reset-password")
async def reset_password(payload: ResetPasswordPayload):
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    record = await db.password_resets.find_one(
        {"token_hash": _hash_reset_token(payload.token.strip())},
        {"_id": 0},
    )
    if not record or record.get("expires_at", "") < datetime.now(timezone.utc).isoformat():
        raise HTTPException(
            status_code=400,
            detail="This reset link is invalid or has expired. Request a new one.",
        )

    user = await db.users.find_one(
        {"id": record["user_id"]},
        {"_id": 0, "password_hash": 1, "password_changes": 1},
    ) or {}

    # The new password must differ from the current one.
    if user.get("password_hash") and verify_password(payload.new_password, user["password_hash"]):
        raise HTTPException(
            status_code=400,
            detail="Your new password must be different from your previous password.",
        )

    # At most PASSWORD_RESETS_PER_DAY resets in any rolling 24 hours.
    now = datetime.now(timezone.utc)
    cutoff = (now - timedelta(hours=24)).isoformat()
    recent_changes = [t for t in (user.get("password_changes") or []) if t > cutoff]
    if len(recent_changes) >= PASSWORD_RESETS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=f"You can reset your password at most {PASSWORD_RESETS_PER_DAY} times a day. Try again later.",
        )

    await db.users.update_one(
        {"id": record["user_id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_changes": recent_changes + [now.isoformat()],
        }},
    )
    # One use only - and any other pending link for the account goes with it.
    await db.password_resets.delete_many({"user_id": record["user_id"]})
    return {"message": "Password updated. You can sign in now."}


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me", response_model=User)
async def me(request: Request):
    return await get_acting_user(request)


class ProfileUpdatePayload(BaseModel):
    username: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None


@api_router.patch("/auth/profile", response_model=User)
async def update_own_profile(payload: ProfileUpdatePayload, request: Request):
    user = await get_acting_user(request)
    update_fields = {}

    if payload.username is not None:
        username = payload.username.strip().lower()

        if not username:
            raise HTTPException(status_code=400, detail="Username required")

        existing_username = await db.users.find_one(
            {"username": username, "id": {"$ne": user.id}}
        )

        if existing_username:
            raise HTTPException(status_code=400, detail="Username already exists")

        update_fields["username"] = username

    if payload.new_password is not None:
        doc = await db.users.find_one({"id": user.id}, {"_id": 0})

        if not verify_password(payload.current_password or "", doc.get("password_hash", "")):
            raise HTTPException(status_code=400, detail="Current password is incorrect")

        if len(payload.new_password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters",
            )

        update_fields["password_hash"] = hash_password(payload.new_password)

    if not update_fields:
        raise HTTPException(status_code=400, detail="Nothing to update")

    await db.users.update_one({"id": user.id}, {"$set": update_fields})
    _invalidate_cached_user(user.id)

    updated = await db.users.find_one({"id": user.id}, {"_id": 0})
    return User(**updated)


@api_router.get("/config/options")
async def get_options():
    return {
        "deliverable_types": DELIVERABLE_TYPES,
        "deliverable_type_categories": DELIVERABLE_TYPE_CATEGORIES,
        "deliverable_type_units": DELIVERABLE_TYPE_UNITS,
        "work_categories": WORK_CATEGORIES,
        "statuses": STATUSES,
        "member_forward_statuses": MEMBER_FORWARD_STATUSES,
        "project_statuses": PROJECT_STATUSES,
        "stages": STAGES,
        "stage_statuses": STAGE_STATUSES,
        "client_statuses": CLIENT_STATUSES,
        "departments": DEPARTMENTS,
        "roles": ROLES,
        "approval_types": APPROVAL_TYPES,
    }


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
@api_router.get("/dashboard/summary")
async def dashboard_summary(request: Request):
    await require_admin(request)
    all_items = await db.work_items.find({}, {"_id": 0}).to_list(10000)
    current_month = datetime.now(timezone.utc).strftime("%Y-%m")
    status_counts = {s: 0 for s in STATUSES}
    total_minutes = 0.0
    items_this_month = 0
    closed_this_month = 0
    creators = set()
    for it in all_items:
        status_counts[it.get("status", "Not Started")] = status_counts.get(it.get("status", "Not Started"), 0) + 1
        total_minutes += max(0.0, _valid_minutes(it.get("time_taken_minutes")) or 0.0)
        if it.get("creator_id"):
            creators.add(it["creator_id"])
        if it.get("month") == current_month:
            items_this_month += 1
            if it.get("status") in DONE_STATUSES:
                closed_this_month += 1
    needs_attention = status_counts.get("Ready for Review", 0) + status_counts.get("Changes Requested", 0)
    return {
        "total_items": len(all_items),
        "status_counts": status_counts,
        "total_hours_logged": round(total_minutes / 60, 1),
        "items_this_month": items_this_month,
        "closed_this_month": closed_this_month,
        "active_members": len(creators),
        "needs_attention_count": needs_attention,
    }


@api_router.get("/dashboard/team-summary")
async def dashboard_team_summary(request: Request):
    await require_admin(request)
    users = await db.users.find({"role": {"$nin": NON_TEAM_ROLES}}, {"_id": 0}).to_list(1000)
    all_items = await db.work_items.find({}, {"_id": 0}).to_list(10000)
    result = []
    for u in users:
        user_items = [it for it in all_items if it.get("creator_id") == u["id"]]
        status_counts = {s: 0 for s in STATUSES}
        total_minutes = 0.0
        for it in user_items:
            status_counts[it.get("status", "Not Started")] = status_counts.get(it.get("status", "Not Started"), 0) + 1
            total_minutes += max(0.0, _valid_minutes(it.get("time_taken_minutes")) or 0.0)
        result.append({
            "user_id": u["id"],
            "name": u["name"],
            "role": u["role"],
            "total_items": len(user_items),
            "status_counts": status_counts,
            "total_hours": round(total_minutes / 60, 1),
        })
    return result


@api_router.get("/dashboard/attention-items")
async def dashboard_attention_items(request: Request):
    await require_admin(request)
    items = await db.work_items.find(
        {"status": {"$in": ["Ready for Review", "Changes Requested"]}}, {"_id": 0}
    ).sort("updated_at", 1).to_list(50)
    users = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0}).to_list(1000)}
    for it in items:
        it["creator_name"] = users.get(it.get("creator_id"), "Unassigned")
    return items

@api_router.get("/dashboard/overview")
async def dashboard_overview(request: Request):
    await require_admin(request)

    today = datetime.now(timezone.utc).date()
    return await cached_read(
        f"dashboard-overview:{today.isoformat()}", lambda: _dashboard_overview(today)
    )


async def _dashboard_overview(today) -> dict:
    week_end = today + timedelta(days=7)

    project_status_task = db.projects.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]).to_list(None)

    deliverable_stage_task = db.deliverables.aggregate([
        {"$group": {"_id": "$current_stage", "count": {"$sum": 1}}}
    ]).to_list(None)

    deliverable_review_task = db.deliverables.count_documents({
        "stage_status": {"$in": ["Ready for Review", "Changes Requested"]}
    })

    project_due_task = db.projects.count_documents({
        "end_date": {"$gte": today.isoformat(), "$lte": week_end.isoformat()},
        "status": {"$ne": "Completed"}
    })

    total_projects_task = db.projects.count_documents({})
    total_deliverables_task = db.deliverables.count_documents({})
    total_work_items_task = db.work_items.count_documents({})

    work_item_hours_task = db.work_items.aggregate([
        {"$group": {"_id": None, "total_minutes": {"$sum": {"$ifNull": ["$time_taken_minutes", 0]}}}}
    ]).to_list(1)

    (
        project_status_rows,
        deliverable_stage_rows,
        needs_review,
        due_this_week,
        total_projects,
        total_deliverables,
        total_work_items,
        work_item_hours_rows,
    ) = await asyncio.gather(
        project_status_task,
        deliverable_stage_task,
        deliverable_review_task,
        project_due_task,
        total_projects_task,
        total_deliverables_task,
        total_work_items_task,
        work_item_hours_task,
    )

    project_status_counts = {s: 0 for s in PROJECT_STATUSES}
    for row in project_status_rows:
        status = row.get("_id") or "Planning"
        project_status_counts[status] = row["count"]

    deliv_stage_counts = {s: 0 for s in STAGES}
    for row in deliverable_stage_rows:
        stage = row.get("_id") or "Content"
        deliv_stage_counts[stage] = row["count"]

    total_minutes = 0
    if work_item_hours_rows:
        total_minutes = work_item_hours_rows[0].get("total_minutes", 0) or 0

    return {
        "active_projects": project_status_counts.get("Active", 0),
        "in_rework": project_status_counts.get("In Rework", 0),
        "completed_projects": project_status_counts.get("Completed", 0),
        "planning_projects": project_status_counts.get("Planning", 0),
        "total_projects": total_projects,
        "total_deliverables": total_deliverables,
        "deliv_stage_counts": deliv_stage_counts,
        "needs_review": needs_review,
        "due_this_week": due_this_week,
        "total_hours_logged": round(total_minutes / 60, 1),
        "total_work_items": total_work_items,
        "project_status_counts": project_status_counts,
    }


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


# ---------------- Clients ----------------
@api_router.get("/worksheet/deliverable-names")
async def worksheet_deliverable_names(request: Request):
    """project_id -> lowercase deliverable names, for the Projects page search.

    /worksheet/lookups returns at most 5000 deliverables, oldest first, so once
    the database grew past that the newest deliverables were cut off and could
    never be found by search. This groups in the database instead: one entry
    per project, no cap on deliverables, and only the name strings travel."""
    await get_acting_user(request)

    rows = await db.deliverables.aggregate([
        {"$match": {"project_id": {"$ne": None}, "name": {"$type": "string"}}},
        {"$group": {"_id": "$project_id", "names": {"$push": {"$toLower": "$name"}}}},
    ]).to_list(None)

    return {row["_id"]: row["names"] for row in rows}


@api_router.get("/worksheet/lookups")
async def worksheet_lookups(request: Request):
    """Everything the Work Sheet needs to fill its Client / Project /
    Deliverable dropdowns, in one request.

    The sheet used to call /clients, /projects and /deliverables separately.
    /projects returned every project with all of its deliverables nested
    inside, and /deliverables then returned the same deliverables again (each
    with an approval-workflow lookup) - thousands of full documents to build
    three dropdowns that only show a name. Here the database projects just
    the few fields the sheet reads, the three queries run at the same time,
    and there is a single round trip instead of three.

    Same scoping as the endpoints it replaces: visible (non-hidden) projects
    only, every deliverable.
    """
    await get_acting_user(request)

    visible_projects = {
        "$or": [{"hidden": False}, {"hidden": {"$exists": False}}]
    }

    clients, projects, deliverables = await asyncio.gather(
        db.clients.find({}, {"_id": 0, "id": 1, "name": 1})
        .sort("name", 1)
        .to_list(None),
        # status: the sheet's pickers leave out delivered/scrapped projects.
        # code / description: tell look-alike project names apart.
        db.projects.find(
            visible_projects,
            {"_id": 0, "id": 1, "name": 1, "client_id": 1, "code": 1, "status": 1, "description": 1},
        )
        .sort("created_at", -1)
        .batch_size(1000)
        .to_list(None),
        # type: the chip next to each deliverable name, and the Deliverable Type
        # a pick fills in. current_stage / stage_status: the dot and status
        # pill in the project hover list.
        db.deliverables.find(
            {},
            {"_id": 0, "id": 1, "name": 1, "project_id": 1, "type": 1, "current_stage": 1, "stage_status": 1},
        )
        .sort("created_at", 1)
        .batch_size(5000)
        .to_list(None),
    )

    return {
        "clients": clients,
        "projects": projects,
        "deliverables": deliverables,
    }


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


@api_router.get("/notifications")
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


@api_router.post("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, request: Request):
    user = await get_acting_user(request)
    result = await db.notifications.update_one(
        {"id": notification_id, "user_id": user.id},
        {"$set": {"read_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"success": True}


@api_router.post("/notifications/read-all")
async def mark_all_notifications_read(request: Request):
    user = await get_acting_user(request)
    result = await db.notifications.update_many(
        {"user_id": user.id, "read_at": None},
        {"$set": {"read_at": now_iso()}},
    )
    return {"success": True, "count": result.modified_count}


class PushTokenPayload(BaseModel):
    token: str = Field(..., min_length=20, max_length=4096)
    platform: str = "web"


@api_router.post("/push/register")
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


@api_router.post("/push/unregister")
async def unregister_push_token(payload: PushTokenPayload, request: Request):
    user = await get_acting_user(request)
    await db.push_tokens.delete_one({"token": payload.token, "user_id": user.id})
    return {"success": True}


@api_router.post("/notifications/{notification_id}/add-row")
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