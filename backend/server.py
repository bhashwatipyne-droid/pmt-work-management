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
        CLIENT_STATUSES,
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
        CLIENT_STATUSES,
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


def normalize_stages(stages: Optional[List[str]]) -> List[str]:
    """
    Return selected production stages in the canonical production order.
    """
    if not stages:
        raise HTTPException(
            status_code=400,
            detail="At least one production stage is required",
        )

    selected = set()

    for stage in stages:
        if stage not in STAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid production stage: {stage}",
            )
        selected.add(stage)

    return [stage for stage in STAGES if stage in selected]


def stored_stages(raw) -> List[str]:
    """normalize_stages() for data already in the database. A legacy or
    hand-edited deliverable with missing/invalid stages yields [] here instead
    of raising an HTTP 400, which would otherwise abort a notification scan
    (and fail whichever user's request happened to trigger it)."""
    try:
        return normalize_stages(raw or [])
    except HTTPException:
        return []


def next_selected_stage(
    current_stage: str,
    required_stages: List[str],
) -> Optional[str]:
    """
    Find the next stage from this deliverable's configured pipeline.
    """
    stages = normalize_stages(required_stages)

    try:
        index = stages.index(current_stage)
    except ValueError:
        return None

    if index + 1 >= len(stages):
        return None

    return stages[index + 1]
def reconcile_stage_after_edit(
    current_stage: Optional[str],
    stage_status: Optional[str],
    stages: List[str],
) -> Optional[dict]:
    """Decide where a deliverable should sit after its production stages
    were edited. Returns the fields to change, or None if it is fine as is.

    `stages` is the new, normalized pipeline. Editing the pipeline used to
    only rewrite `required_stages`, leaving `current_stage` / `stage_status`
    untouched, so a deliverable could end up pointing at a stage that is no
    longer in its pipeline (e.g. pipeline changed to Design while the
    deliverable still said "Content - Completed"). No team's board matched it
    and nobody was ever asked to approve or work on it.

    - Current stage still in the pipeline and not finished: leave it alone.
    - Current stage finished and a later stage now exists (a stage was
      added): hand it to that stage, with its approval open.
    - Current stage removed and a later stage exists: hand it to the next
      stage in the pipeline, with its approval open.
    - Current stage removed and nothing later remains: every remaining stage
      is already behind it, so the deliverable is complete.
    """
    order = {stage: index for index, stage in enumerate(STAGES)}
    current_index = order.get(current_stage, -1)

    if current_stage in stages:
        if stage_status != "Completed":
            return None
        later = [stage for stage in stages if order[stage] > current_index]
        if later:
            return {"current_stage": later[0], "stage_status": "Ready for Review"}
        return None

    later = [stage for stage in stages if order[stage] > current_index]
    if later:
        return {"current_stage": later[0], "stage_status": "Ready for Review"}
    return {"current_stage": stages[-1], "stage_status": "Completed"}


def _format_date_short(value: Optional[str]) -> str:
    """"2026-09-24" -> "24 Sep". Falls back to the raw value if it isn't a
    plain YYYY-MM-DD date, so a bad stored value never breaks a message."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b")
    except (TypeError, ValueError):
        return value or ""


def format_stage_window(window: Optional[dict]) -> str:
    """{"start_dt": "2026-09-22", "end_dt": "2026-09-24"} -> "22 Sep - 24 Sep".
    An end date with no start (a deadline only) -> "due 24 Sep". Empty string
    when there is no window to show at all."""
    if not window or not window.get("end_dt"):
        return ""
    if not window.get("start_dt"):
        return f'due {_format_date_short(window["end_dt"])}'
    return f'{_format_date_short(window["start_dt"])} - {_format_date_short(window["end_dt"])}'


def normalize_stage_schedule(
    required_stages: List[str],
    stage_schedule: Optional[dict],
) -> Dict[str, Dict[str, Optional[str]]]:
    """Clean a stage_schedule payload down to one validated entry per stage
    that has at least an end date (a deadline). Raises HTTPException(400) on
    a bad date, an inverted range, or a start with no end.

    A stage's end date alone is a normal, common case - "due the 24th" with no
    fixed start, e.g. because it starts whenever the previous stage finishes.
    A start with no end isn't very useful for tracking a deadline, so that
    combination is rejected rather than silently accepted. A stage not in
    `required_stages` is silently dropped (e.g. the stage was deselected in
    the same edit). A stage with no dates at all simply has no entry:
    deadline tracking is opt-in per stage, not mandatory."""
    cleaned: Dict[str, Dict[str, Optional[str]]] = {}
    for stage, window in (stage_schedule or {}).items():
        if stage not in required_stages:
            continue
        start = (window or {}).get("start_dt") or None
        end = (window or {}).get("end_dt") or None
        if not start and not end:
            continue
        if start and not end:
            raise HTTPException(
                status_code=400,
                detail=f"The {stage} stage has a start date but no end date (deadline) - add one, or remove the start date.",
            )
        for value in (v for v in (start, end) if v):
            try:
                validate_work_date(value)
            except HTTPException:
                raise HTTPException(
                    status_code=400,
                    detail=f"The {stage} stage's dates must be valid (got \"{value}\").",
                )
        if start and end and end < start:
            raise HTTPException(
                status_code=400,
                detail=f"The {stage} stage's end date must be on or after its start date.",
            )
        cleaned[stage] = {"start_dt": start, "end_dt": end}
    return cleaned


def derive_deliverable_dates(
    required_stages: List[str],
    stage_schedule: dict,
) -> tuple:
    """The deliverable's overall start/end, derived as the earliest stage
    start and latest stage end among its own required_stages. A stage with
    only an end date (a deadline, no fixed start) contributes to the overall
    end but not the overall start. (None, None) when no stage has a tracked
    window at all."""
    starts = [
        stage_schedule[s]["start_dt"]
        for s in required_stages
        if s in stage_schedule and stage_schedule[s].get("start_dt")
    ]
    ends = [
        stage_schedule[s]["end_dt"]
        for s in required_stages
        if s in stage_schedule and stage_schedule[s].get("end_dt")
    ]
    return (min(starts) if starts else None, max(ends) if ends else None)


STAGE_STATUSES = ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"]
DEPARTMENTS = ["Content", "Design", "Animation", "Administration"]
# "hr" (Finance) is its own role, separate from admin, manager and member: it only
# sees the invoicing screens (see HR_ALLOWED_PREFIXES) and is not part of the
# production team, so it is left out of team, efficiency and workload lists.
ROLES = ["admin", "manager", "member", "hr"]
NON_TEAM_ROLES = ["admin", "hr"]
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


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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


# ---------------- Push (Firebase Cloud Messaging) ----------------
_firebase_app = None
_firebase_init_attempted = False
_firebase_init_lock = threading.Lock()
_background_tasks: set = set()


def _fire_and_forget(coro):
    """Run a coroutine without blocking the request. The set keeps a strong
    reference so the task isn't garbage-collected mid-flight."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# One lock per key, kept only while somebody holds or waits on it. Used to make
# "check whether it already exists, then insert" atomic for requests that land
# on this server at the same moment (a double click on Create, a retried upload).
# It cannot see a second server instance; the checks it guards also read the
# database, so a request that arrives after the first one finished still sees it.
_keyed_locks: "weakref.WeakValueDictionary[str, asyncio.Lock]" = weakref.WeakValueDictionary()


def _keyed_lock(key: str) -> asyncio.Lock:
    lock = _keyed_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _keyed_locks[key] = lock
    return lock


def _get_firebase_app():
    """Lazily initialise firebase-admin from the service-account key, given
    either as the FIREBASE_SERVICE_ACCOUNT_JSON env var (full JSON contents)
    or as a secret file at /etc/secrets/firebase-service-account.json.
    Returns None when neither is present, which simply disables push.

    Importing firebase_admin costs ~2s of CPU, so callers must run this in a
    worker thread (asyncio.to_thread) - never directly on the event loop."""
    global _firebase_app, _firebase_init_attempted
    with _firebase_init_lock:
        if _firebase_init_attempted:
            return _firebase_app
        _firebase_init_attempted = True

        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not raw:
            # Alternative: a Render "Secret File" (mounted under /etc/secrets/).
            key_path = os.environ.get(
                "FIREBASE_SERVICE_ACCOUNT_FILE",
                "/etc/secrets/firebase-service-account.json",
            )
            if os.path.isfile(key_path):
                raw = Path(key_path).read_text(encoding="utf-8")
        if not raw:
            logger.info(
                "No Firebase service account (FIREBASE_SERVICE_ACCOUNT_JSON or "
                "/etc/secrets/firebase-service-account.json); push notifications disabled"
            )
            return None

        try:
            import firebase_admin
            from firebase_admin import credentials
            from firebase_admin import messaging  # noqa: F401  (warm the import)

            _firebase_app = firebase_admin.initialize_app(
                credentials.Certificate(json.loads(raw))
            )
        except Exception:
            logger.exception("Could not initialise Firebase Admin; push notifications disabled")
            _firebase_app = None
        return _firebase_app


MAX_PUSHES_PER_USER_BATCH = 3


def _push_link(notification: dict, is_admin: bool, is_approver: bool = False) -> str:
    """Where clicking the push should take this recipient."""
    action_type = notification.get("action_type")
    if (
        notification.get("type") == "delayed_deadline"
        and notification.get("deliverable_id")
        and (is_admin or is_approver)
    ):
        link = f"/approvals?deliverable={notification['deliverable_id']}&fallback=worksheet"
        if notification.get("deliverable_name"):
            link += "&name=" + quote(str(notification["deliverable_name"]))
        return link
    if action_type == "open_approvals":
        if notification.get("deliverable_id"):
            return f"/approvals?deliverable={notification['deliverable_id']}"
        return "/approvals"
    if action_type in ("open_worksheet", "add_work_row"):
        return "/"
    if action_type == "add_deliverable" and notification.get("project_id"):
        return f"/projects/{notification['project_id']}"
    if notification.get("project_id") and is_admin:
        return f"/projects/{notification['project_id']}"
    return "/"


async def _send_push_for_notifications(notifications: list[dict]):
    """Send one FCM web-push per (notification, registered browser). Never
    raises: a push failure must not affect the request that created the
    in-app notification."""
    try:
        firebase_app = await asyncio.to_thread(_get_firebase_app)
        if not firebase_app or not notifications:
            return

        user_ids = list({n["user_id"] for n in notifications})
        token_docs = await db.push_tokens.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "token": 1, "user_id": 1},
        ).to_list(5000)
        if not token_docs:
            logger.info("Push skipped: no browsers registered for %d user(s)", len(user_ids))
            return

        tokens_by_user: dict[str, list[str]] = {}
        for doc in token_docs:
            tokens_by_user.setdefault(doc["user_id"], []).append(doc["token"])

        # Only admins can open project detail pages, so only they get a
        # project deep link; everyone else lands on the page they can use.
        admin_ids = {
            u["id"]
            for u in await db.users.find(
                {"id": {"$in": list(tokens_by_user)}, "role": "admin"},
                {"_id": 0, "id": 1},
            ).to_list(5000)
        }
        manager_ids = {
            u["id"]
            for u in await db.users.find(
                {"id": {"$in": list(tokens_by_user)}, "role": "manager"},
                {"_id": 0, "id": 1},
            ).to_list(5000)
        }

        notifications_by_user: dict[str, list[dict]] = {}
        for notification in notifications:
            notifications_by_user.setdefault(notification["user_id"], []).append(notification)

        from firebase_admin import messaging

        # Data-only messages: the service worker builds the visible
        # notification, so title/body/link all travel in `data` (strings only).
        messages = []
        for user_id, user_notifications in notifications_by_user.items():
            user_tokens = tokens_by_user.get(user_id)
            if not user_tokens:
                logger.info("Push skipped: no browser registered for user %s", user_id)
                continue

            if len(user_notifications) > MAX_PUSHES_PER_USER_BATCH:
                # A backlog (e.g. several approvals crossing the reminder
                # threshold at once) becomes one push instead of a pile.
                payloads = [{
                    "title": f"{len(user_notifications)} new notifications",
                    "body": "Open PMT to review them.",
                    "notification_id": "",
                    "type": "summary",
                    "link": "/",
                }]
            else:
                payloads = [
                    {
                        "title": str(n.get("title") or "TheFinpedia PMT"),
                        "body": str(n.get("message") or ""),
                        "notification_id": str(n.get("id") or ""),
                        "type": str(n.get("type") or ""),
                        "link": _push_link(n, is_admin=user_id in admin_ids, is_approver=user_id in manager_ids),
                    }
                    for n in user_notifications
                ]

            for data in payloads:
                for token in user_tokens:
                    messages.append(
                        messaging.Message(
                            token=token,
                            data=data,
                            webpush=messaging.WebpushConfig(
                                headers={"TTL": "86400", "Urgency": "high"}
                            ),
                        )
                    )

        dead_tokens: list[str] = []
        sent = failed = 0
        for start in range(0, len(messages), 500):  # FCM batch limit
            chunk = messages[start:start + 500]
            response = await asyncio.to_thread(
                messaging.send_each, chunk, app=firebase_app
            )
            for message, result in zip(chunk, response.responses):
                if result.success:
                    sent += 1
                    continue
                failed += 1
                logger.warning(
                    "Push to browser %s... rejected by FCM: %s: %s",
                    message.token[:10],
                    type(result.exception).__name__,
                    result.exception,
                )
                if isinstance(
                    result.exception,
                    (messaging.UnregisteredError, messaging.SenderIdMismatchError),
                ):
                    dead_tokens.append(message.token)

        if messages:
            logger.info("Push notifications: %d accepted by FCM, %d failed", sent, failed)

        if dead_tokens:
            await db.push_tokens.delete_many({"token": {"$in": dead_tokens}})
    except Exception:
        logger.exception("Push notification send failed")


# ---------------- Notifications ----------------
async def _production_users_for_stages(
    stages: List[str], roles: Optional[List[str]] = None
) -> list[dict]:
    departments = [
        department
        for department, stage in DEPARTMENT_TO_STAGE.items()
        if stage in stages
    ]

    if not departments:
        return []

    query: dict = {
        "active": {"$ne": False},
        "department": {"$in": departments},
    }
    if roles:
        query["role"] = {"$in": roles}

    return await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


# Approval notices ("<stage> approval ready", "New deliverable added ... ready
# for <stage>") are only something a manager can act on: Approvals actions are
# manager-only. Team members get none of them, are never sent them, and never
# see ones that were stored before this rule (see list_notifications and
# migrate_manager_only_approval_notifications).
_APPROVAL_NOTICE_QUERY = {
    "$or": [
        {"type": "stage_handoff"},
        {"type": "new_project", "action_type": "add_work_row"},
    ]
}


async def _admin_users() -> list[dict]:
    """Recipients for notifications that only an admin can act on: creating
    deliverables and editing project status/timeline both require the admin
    role, so notifying production staff about them left those recipients
    with nothing they could actually do."""
    return await db.users.find(
        {"active": {"$ne": False}, "role": "admin"},
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


# (user_id, dedupe_key) pairs this process has already written. The overdue scan
# rebuilds the SAME notifications every minute; without this, every one of them
# (thousands: overdue deliverables x recipients) is re-sent to MongoDB as an
# upsert that matches and changes nothing - a steady stream of outbound
# bandwidth. Only used by the overdue scan (skip_known=True). Worst case after a
# restart is one full send, then only genuinely new notices go out.
_known_notification_keys: set = set()
_KNOWN_NOTIFICATION_KEYS_MAX = 200_000


async def _upsert_notifications_batch(notifications: list[dict], skip_known: bool = False):
    """Write many notifications in a single round trip instead of one
    update_one() per notification. Each op is an independent upsert keyed
    on (user_id, dedupe_key), so ordered=False lets the rest of the batch
    succeed even if one entry races with a concurrent insert."""
    if not notifications:
        return

    if skip_known:
        notifications = [
            n for n in notifications
            if (n.get("user_id"), n.get("dedupe_key")) not in _known_notification_keys
        ]
        if not notifications:
            return

    ops = []
    for notification in notifications:
        dedupe_key = notification.get("dedupe_key")
        if not dedupe_key:
            dedupe_key = str(uuid.uuid4())
            notification["dedupe_key"] = dedupe_key

        ops.append(
            UpdateOne(
                {
                    "user_id": notification["user_id"],
                    "dedupe_key": dedupe_key,
                },
                {"$setOnInsert": notification},
                upsert=True,
            )
        )

    result = await db.notifications.bulk_write(ops, ordered=False)

    if skip_known:
        # Every op either inserted or matched an existing row, so all of them
        # exist now and need not be sent again.
        if len(_known_notification_keys) > _KNOWN_NOTIFICATION_KEYS_MAX:
            _known_notification_keys.clear()
        _known_notification_keys.update(
            (n["user_id"], n["dedupe_key"]) for n in notifications
        )

    # Push only the rows that were actually inserted. Upserts that matched an
    # existing (user_id, dedupe_key) are re-runs of a notification the user
    # already has, e.g. the periodic overdue scan.
    created = [notifications[index] for index in (result.upserted_ids or {})]
    if created:
        _fire_and_forget(_send_push_for_notifications(created))


async def _upsert_notification(notification: dict):
    await _upsert_notifications_batch([notification])


async def _notify_admins_deliverable_missing(reporter: "User", item: dict):
    """A user chose "Not available" in the worksheet's Deliverable dropdown:
    tell every admin to check the deliverables under that client in that
    project and add the missing one. Never raises - the worksheet save that
    triggered it must not fail because a notification could not be written.

    One notice per (project, admin): a second "Not available" on the same
    project while the first is still pending would only be noise. Once the
    admin has added deliverables the notice is marked actioned (see
    _resolve_deliverable_missing_notifications), so the next "Not available"
    on that project replaces it with a fresh, unread one."""
    try:
        project_id = item.get("project_id")
        if not project_id:
            return

        project = await db.projects.find_one(
            {"id": project_id}, {"_id": 0, "name": 1, "client_id": 1}
        )
        if not project:
            return

        client_id = project.get("client_id") or item.get("client_id")
        client_doc = (
            await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1})
            if client_id
            else None
        )
        client_name = (client_doc or {}).get("name", "")
        project_name = project.get("name", "the project")

        admins = await _admin_users()
        if not admins:
            return

        dedupe_key = f"deliverable-missing:{project_id}"

        # An earlier notice the admin already actioned must not block a new one.
        await db.notifications.delete_many(
            {"dedupe_key": dedupe_key, "actioned_at": {"$ne": None}}
        )

        reporter_name = getattr(reporter, "name", None) or "A team member"
        where = f"{project_name} (Client: {client_name})" if client_name else project_name
        message = (
            f"{reporter_name} selected 'Not available' as the deliverable for {where}. "
            + (
                f"Please check all deliverables under {client_name} in this project and add the missing one."
                if client_name
                else "Please check all deliverables in this project and add the missing one."
            )
        )

        ts = now_iso()
        await _upsert_notifications_batch([
            {
                "id": str(uuid.uuid4()),
                "user_id": admin["id"],
                "type": "deliverable_missing",
                "title": "Deliverable not available",
                "message": message,
                "project_id": project_id,
                "deliverable_id": None,
                "client_id": client_id,
                "stage": item.get("stage"),
                "action_type": "add_deliverable",
                "created_at": ts,
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": dedupe_key,
            }
            for admin in admins
        ])
    except Exception:
        logger.exception("Could not create the deliverable-missing notification")


async def _resolve_deliverable_missing_notifications(project_id: Optional[str]):
    """Deliverables were just added to this project, so any pending
    'Not available' notice for it has been dealt with: drop the Add
    deliverable button and mark it read. Never raises."""
    if not project_id:
        return
    try:
        ts = now_iso()
        pending = {
            "type": "deliverable_missing",
            "project_id": project_id,
            "actioned_at": None,
        }
        await db.notifications.update_many({**pending, "read_at": None}, {"$set": {"read_at": ts}})
        await db.notifications.update_many(pending, {"$set": {"actioned_at": ts}})
    except Exception:
        logger.exception("Could not resolve the deliverable-missing notifications")


async def _notify_new_project(
    project: dict,
    deliverables: list[dict],
    title: str = "New project added",
    client_name: Optional[str] = None,
):
    """Create one notification per project/deliverable/stage/user.

    `title` is only used for the per-deliverable notices sent to production
    staff; pass a different one when deliverables are added to an existing
    project. Callers that already loaded the client can pass `client_name`
    to skip the lookup."""
    if client_name is None:
        client_doc = await db.clients.find_one(
            {"id": project.get("client_id")},
            {"_id": 0, "name": 1},
        )
        client_name = client_doc.get("name", "") if client_doc else ""

    pending_notifications: list[dict] = []

    if deliverables:
        await _resolve_deliverable_missing_notifications(project.get("id"))

    if not deliverables:
        # No deliverables yet means there's nothing for production staff to
        # act on — only an admin can add deliverables to a project, so only
        # admins are notified here.
        recipients = await _admin_users()
        for recipient in recipients:
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "new_project",
                "title": "New project added",
                "message": (
                    f'{project.get("name", "Project")} has been created.'
                    + (f' Client: {client_name}.' if client_name else "")
                    + " Add deliverables when the production plan is ready."
                ),
                "project_id": project.get("id"),
                "deliverable_id": None,
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": None,
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'new-project:{project.get("id")}:{recipient["id"]}',
            })
        await _upsert_notifications_batch(pending_notifications)
        return

    # One users query for the whole batch (it used to be one per deliverable),
    # then each deliverable's recipients are picked from it in memory.
    all_stages = {
        stage
        for deliverable in deliverables
        for stage in stored_stages(deliverable.get("required_stages"))
    }
    # Managers only: the per-deliverable "ready for <stage>" notice is an
    # approval notice, and team members do not act on approvals.
    production_users = await _production_users_for_stages(
        list(all_stages), roles=["manager"]
    )

    for deliverable in deliverables:
        if deliverable.get("stage_status") == "Completed":
            # Already fully done when created (e.g. imported historical data
            # via the "Finish" status) - there is nothing left for any team
            # to do on it, so no "ready for X" notice goes out for it.
            continue

        stages = stored_stages(deliverable.get("required_stages"))
        schedule = deliverable.get("stage_schedule") or {}
        recipients = [
            user
            for user in production_users
            if DEPARTMENT_TO_STAGE.get(user.get("department")) in stages
        ]

        for recipient in recipients:
            stage = DEPARTMENT_TO_STAGE.get(recipient.get("department"), stages[0])
            window_text = format_stage_window(schedule.get(stage))
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "new_project",
                "title": title,
                "message": (
                    f'{project.get("name", "Project")} · '
                    f'{deliverable.get("name", "Deliverable")} '
                    f'is ready for {stage}'
                    + (f' ({window_text})' if window_text else "")
                    + "."
                    + (f' Client: {client_name}.' if client_name else "")
                ),
                "project_id": project.get("id"),
                "deliverable_id": deliverable.get("id"),
                "client_id": project.get("client_id"),
                "stage": stage,
                "action_type": "add_work_row",
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'new-project:{project.get("id")}:{deliverable.get("id")}:{recipient["id"]}',
            })

    await _upsert_notifications_batch(pending_notifications)


_last_overdue_notification_check: Optional[datetime] = None


async def _ensure_overdue_notifications():
    """Materialize overdue deadline notifications without requiring a scheduler.

    Rewritten to avoid N+1 queries: the original version issued one
    deliverables lookup per overdue project, one project lookup per overdue
    deliverable, one users lookup per project/deliverable, and one DB round
    trip per individual notification. On any account with more than a
    handful of overdue items, that turned every ~60s check into dozens or
    hundreds of sequential awaits — which is what made the bell noticeably
    slow to open on the request that happened to land outside the throttle
    window. This version does a fixed, small number of batched queries plus
    a single bulk write, regardless of how many projects/deliverables are
    overdue.
    """
    global _last_overdue_notification_check

    check_now = datetime.now(timezone.utc)
    if (
        _last_overdue_notification_check
        and check_now - _last_overdue_notification_check < timedelta(minutes=1)
    ):
        return

    _last_overdue_notification_check = check_now
    today = check_now.date().isoformat()

    # Load every active user once and group by department in memory, instead
    # of re-querying db.users for every overdue project/deliverable below.
    all_users = await db.users.find(
        {"active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "department": 1, "role": 1},
    ).to_list(1000)

    users_by_department: dict = {}
    for user in all_users:
        users_by_department.setdefault(user.get("department"), []).append(user)

    admin_users = [user for user in all_users if user.get("role") == "admin"]

    def recipients_for_stages(stages: List[str]) -> list[dict]:
        departments = [
            department
            for department, stage in DEPARTMENT_TO_STAGE.items()
            if stage in stages
        ]
        recipients = []
        seen_ids = set()
        for department in departments:
            for user in users_by_department.get(department, []):
                if user["id"] not in seen_ids:
                    seen_ids.add(user["id"])
                    recipients.append(user)
        return recipients

    pending_notifications: list[dict] = []

    projects = await db.projects.find(
        {
            "end_date": {"$lt": today},
            "status": {"$nin": ["Completed", "Ready for Invoice", "Raised Invoice", "Scrapped"]},
        },
        {"_id": 0},
    ).to_list(5000)

    # Project-level timeline health is an admin concern — only an admin can
    # change a project's status or dates (PATCH /projects/{id} requires
    # require_admin), so production staff had no way to act on these.
    for project in projects:
        for recipient in admin_users:
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "delayed_deadline",
                "title": "Project deadline delayed",
                "message": (
                    f'{project.get("name", "Project")} was due on '
                    f'{project.get("end_date", "")} and is still {project.get("status", "active").lower()}. '
                    "Please review the project timeline."
                ),
                "project_id": project.get("id"),
                "deliverable_id": None,
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": None,
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'project-overdue:{project.get("id")}:{project.get("end_date")}:{recipient["id"]}',
            })

    # Deliverables with a per-stage schedule (stage_schedule) are checked
    # against the CURRENT stage's own end date, not the deliverable's overall
    # end_dt - the overall end_dt is the LATEST of every stage's end, so a
    # deliverable whose Content window already closed can still have a
    # future overall end_dt (Design/Animate finish later) and would never
    # show up if only the overall date were checked here.
    legacy_overdue = await db.deliverables.find(
        {
            "end_dt": {"$lt": today},
            "stage_status": {"$nin": ["Completed", "Closed"]},   # Closed = legacy finished import
            "$or": [{"stage_schedule": {"$exists": False}}, {"stage_schedule": {}}],
        },
        {"_id": 0},
    ).to_list(5000)

    scheduled_candidates = await db.deliverables.find(
        {
            "stage_status": {"$nin": ["Completed", "Closed"]},   # Closed = legacy finished import
            "stage_schedule": {"$nin": [None, {}]},
        },
        {"_id": 0},
    ).to_list(5000)

    stage_overdue = [
        d
        for d in scheduled_candidates
        if (d.get("stage_schedule") or {}).get(d.get("current_stage"), {}).get("end_dt", today) < today
    ]

    overdue_deliverables = legacy_overdue + stage_overdue

    if overdue_deliverables:
        parent_ids = list({
            d.get("project_id") for d in overdue_deliverables if d.get("project_id")
        })

        # One batched query for all the parent projects, instead of one
        # find_one() per overdue deliverable.
        parent_projects = await db.projects.find(
            {"id": {"$in": parent_ids}},
            {"_id": 0, "id": 1, "name": 1, "client_id": 1, "status": 1},
        ).to_list(5000)
        projects_by_id = {p["id"]: p for p in parent_projects}

        for deliverable in overdue_deliverables:
            project = projects_by_id.get(deliverable.get("project_id"))
            if not project:
                continue

            schedule = deliverable.get("stage_schedule") or {}
            required = stored_stages(deliverable.get("required_stages"))
            if schedule:
                # Only the team currently holding the deliverable is late -
                # a downstream team's window hasn't opened yet, so they
                # aren't the ones missing a deadline.
                current_stage = deliverable.get("current_stage")
                target_stages = [current_stage] if current_stage in required else []
                due_date = (schedule.get(current_stage) or {}).get("end_dt", "")
            else:
                target_stages = required
                due_date = deliverable.get("end_dt", "")

            recipients = recipients_for_stages(target_stages)

            for recipient in recipients:
                stage = DEPARTMENT_TO_STAGE.get(recipient.get("department"))
                if stage not in target_stages:
                    continue

                pending_notifications.append({
                    "id": str(uuid.uuid4()),
                    "user_id": recipient["id"],
                    "type": "delayed_deadline",
                    "title": "Deliverable deadline delayed",
                    "message": (
                        f'{deliverable.get("name", "Deliverable")} in '
                        f'{project.get("name", "Project")} '
                        + (f'({stage} stage) ' if schedule else "")
                        + f'was due on {due_date} and is not completed.'
                    ),
                    "project_id": deliverable.get("project_id"),
                    "deliverable_id": deliverable.get("id"),
                    "client_id": project.get("client_id"),
                    "stage": stage,
                    "action_type": None,
                    "created_at": now_iso(),
                    "read_at": None,
                    "actioned_at": None,
                    "dedupe_key": f'deliverable-overdue:{deliverable.get("id")}:{stage}:{due_date}:{recipient["id"]}',
                })

    await _upsert_notifications_batch(pending_notifications, skip_known=True)


# ---------------- Reminder notifications ----------------
# Rule-based reminders, materialised lazily (same no-scheduler approach as
# _ensure_overdue_notifications): worksheet inactivity and stuck approvals.
try:
    REMINDER_TIMEZONE = ZoneInfo("Asia/Kolkata")
except ZoneInfoNotFoundError:  # tz database missing (e.g. Windows without tzdata)
    REMINDER_TIMEZONE = timezone(timedelta(hours=5, minutes=30))  # IST has no DST
# Inactivity reminders go out on/after this local hour of the next working day,
# so nobody is pinged at midnight just because the first poll of the day landed.
INACTIVITY_REMINDER_HOUR = 10
APPROVAL_STUCK_DAYS = 2
REMINDER_CHECK_INTERVAL = timedelta(minutes=5)

APPROVAL_TYPE_LABELS = {
    "MANAGER": "manager",
    "LEADERSHIP": "leadership",
    "CLIENT_SPOC": "client SPOC",
    "COMPLIANCE": "compliance",
}

_last_reminder_check: Optional[datetime] = None
_inactivity_processed_day: Optional[str] = None


def _parse_utc(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _previous_working_day(day):
    """Previous Monday-Friday before `day` (Monday -> the prior Friday)."""
    day = day - timedelta(days=1)
    while day.weekday() >= 5:
        day = day - timedelta(days=1)
    return day


def _local_day_window_utc(day) -> dict:
    """Mongo range filter covering one calendar day in REMINDER_TIMEZONE,
    expressed against the UTC ISO timestamps PMT stores."""
    start = datetime(day.year, day.month, day.day, tzinfo=REMINDER_TIMEZONE)
    end = start + timedelta(days=1)
    return {
        "$gte": start.astimezone(timezone.utc).isoformat(),
        "$lt": end.astimezone(timezone.utc).isoformat(),
    }


async def _worksheet_inactivity_notifications(local_now: datetime):
    """Users who did nothing on the Work Sheet on the previous working day get
    one reminder on the next working day.

    Returns (notifications, day_iso); day_iso is None when the rule didn't run.

    "Activity" means any of: a row created or edited (created_at/updated_at)
    or dated (work_date) on that day, a row they review/manage that was
    touched, or a status/stage change they logged. Admins are excluded (the
    Work Sheet is view-only for them), as are users who have never been on a
    work row.
    """
    if local_now.weekday() >= 5 or local_now.hour < INACTIVITY_REMINDER_HOUR:
        return [], None

    target_day = _previous_working_day(local_now.date())
    day_iso = target_day.isoformat()
    if day_iso == _inactivity_processed_day:
        return [], day_iso

    window = _local_day_window_utc(target_day)

    users = await db.users.find(
        {"active": {"$ne": False}, "role": {"$nin": NON_TEAM_ROLES}},
        {"_id": 0, "id": 1},
    ).to_list(5000)

    involved: set = set()
    for field in ("creator_id", "reviewer_id", "manager_id"):
        involved.update(v for v in await db.work_items.distinct(field) if v)

    active: set = set()
    active.update(
        v for v in await db.work_items.distinct(
            "creator_id",
            {"$or": [
                {"work_date": day_iso},
                {"created_at": window},
                {"updated_at": window},
            ]},
        ) if v
    )
    for field in ("reviewer_id", "manager_id"):
        active.update(
            v for v in await db.work_items.distinct(field, {"updated_at": window}) if v
        )
    active.update(
        v for v in await db.work_item_activity_log.distinct(
            "changed_by", {"changed_at": window}
        ) if v
    )

    notifications = []
    for user in users:
        user_id = user["id"]
        if user_id not in involved or user_id in active:
            continue
        notifications.append({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "worksheet_inactivity",
            "title": "Update your work sheet",
            "message": (
                f"You had no work sheet activity on {target_day.strftime('%A, %d %b')}. "
                "Please add or update your entries."
            ),
            "project_id": None,
            "deliverable_id": None,
            "client_id": None,
            "stage": None,
            "action_type": "open_worksheet",
            "created_at": now_iso(),
            "read_at": None,
            "actioned_at": None,
            "dedupe_key": f"worksheet-inactivity:{user_id}:{day_iso}",
        })

    return notifications, day_iso


async def _stuck_approval_notifications(now: datetime) -> list[dict]:
    """One reminder per pending approval that has waited APPROVAL_STUCK_DAYS+,
    sent to whoever can actually act on it (mirrors _approval_item_can_act):
    the assignee; else stage managers for MANAGER, the Administration
    department for COMPLIANCE; admins when nobody else can act. The dedupe key
    includes requested_at, so a resubmitted approval is reminded afresh."""
    cutoff = now - timedelta(days=APPROVAL_STUCK_DAYS)

    items = await db.approval_items.find(
        {"status": "PENDING", "hidden": {"$ne": True}},
        {"_id": 0},
    ).to_list(5000)

    stuck = []
    for item in items:
        requested_at = _parse_utc(
            item.get("requested_at") or item.get("updated_at") or item.get("created_at")
        )
        if requested_at and requested_at <= cutoff:
            stuck.append((item, requested_at))
    if not stuck:
        return []

    deliverable_ids = list({i["deliverable_id"] for i, _ in stuck if i.get("deliverable_id")})
    deliverables = {
        d["id"]: d
        for d in await db.deliverables.find(
            {"id": {"$in": deliverable_ids}},
            {"_id": 0, "id": 1, "name": 1, "project_id": 1, "current_stage": 1},
        ).to_list(5000)
    }
    project_ids = list({d.get("project_id") for d in deliverables.values() if d.get("project_id")})
    projects = {
        p["id"]: p
        for p in await db.projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0, "id": 1, "name": 1, "client_id": 1},
        ).to_list(5000)
    }
    users = await db.users.find(
        {"active": {"$ne": False}},
        {"_id": 0, "id": 1, "role": 1, "department": 1},
    ).to_list(5000)
    active_ids = {u["id"] for u in users}
    admin_ids = [u["id"] for u in users if u.get("role") == "admin"]

    notifications = []
    for item, requested_at in stuck:
        deliverable = deliverables.get(item.get("deliverable_id"))
        if not deliverable:
            continue  # orphaned approval row

        approval_type = item.get("approval_type")
        if item.get("assigned_to"):
            recipients = [item["assigned_to"]] if item["assigned_to"] in active_ids else []
        elif approval_type == "MANAGER":
            recipients = [
                u["id"] for u in users
                if u.get("role") == "manager"
                and DEPARTMENT_TO_STAGE.get(u.get("department")) == deliverable.get("current_stage")
            ]
        elif approval_type in ANY_MANAGER_APPROVAL_TYPES:
            recipients = [u["id"] for u in users if u.get("role") == "manager"]
        else:
            recipients = []
        if not recipients:
            recipients = admin_ids

        project = projects.get(deliverable.get("project_id")) or {}
        days_waiting = max(APPROVAL_STUCK_DAYS, (now - requested_at).days)
        label = APPROVAL_TYPE_LABELS.get(approval_type, "")
        subject = deliverable.get("name", "Deliverable")
        if project.get("name"):
            subject = f"{subject} · {project['name']}"

        for recipient_id in set(recipients):
            notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient_id,
                "type": "approval_stuck",
                "title": "Approval waiting for action",
                "message": (
                    f"{subject} has been waiting for {label + ' ' if label else ''}"
                    f"approval for {days_waiting} days."
                ),
                "project_id": deliverable.get("project_id"),
                "deliverable_id": deliverable.get("id"),
                "approval_item_id": item.get("id"),
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": "open_approvals",
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f"approval-stuck:{item.get('id')}:{requested_at.isoformat()}:{recipient_id}",
            })

    return notifications


async def _ensure_reminder_notifications():
    """Run the reminder rules at most once per REMINDER_CHECK_INTERVAL. Never
    raises: a reminder problem must not break the notifications endpoint."""
    global _last_reminder_check, _inactivity_processed_day

    now = datetime.now(timezone.utc)
    if _last_reminder_check and now - _last_reminder_check < REMINDER_CHECK_INTERVAL:
        return
    _last_reminder_check = now

    try:
        pending = await _stuck_approval_notifications(now)

        inactivity, inactivity_day = await _worksheet_inactivity_notifications(
            now.astimezone(REMINDER_TIMEZONE)
        )
        pending.extend(inactivity)

        await _upsert_notifications_batch(pending)

        if inactivity_day:
            _inactivity_processed_day = inactivity_day
    except Exception:
        logger.exception("Reminder notification check failed")


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


@api_router.get("/users", response_model=List[User])
async def list_users(request: Request):
    await get_acting_user(request)
    return await db.users.find({}, {"_id": 0}).to_list(1000)


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


@api_router.get("/work-items/pending-count")
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


@api_router.get("/work-items", response_model=List[WorkItem])
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


@api_router.post("/work-items/{item_id}/review", response_model=WorkItem)
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


@api_router.patch("/work-items/{item_id}", response_model=WorkItem)
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


@api_router.post("/work-items/bulk-create", response_model=List[WorkItem])
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


class ExpandUnitsPayload(BaseModel):
    count: int


def unit_row_name(deliverable_type: str, unit: str, index: int) -> str:
    """"Presentation (PPT) - Per Slide" -> "Presentation (PPT) - Slide 3"."""
    base = re.sub(r"\s+-\s+Per\s+\w+$", "", deliverable_type).strip()
    return f"{base} - {unit} {index}"


@api_router.post("/work-items/{item_id}/expand-units")
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


class CollaboratorsPayload(BaseModel):
    ids: List[str]
    creator_ids: List[str]


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


@api_router.post("/work-items/collaborators")
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


@api_router.post("/work-items/bulk-update", response_model=List[WorkItem])
async def bulk_update_work_items(payload: BulkUpdatePayload, request: Request):
    user = await get_acting_user(request)

    if not payload.ids:
        return []

    raw_fields = payload.patch.model_dump(exclude_unset=True)

    if not raw_fields:
        return []

    # Admins are view-only.
    if user.role == "admin":
        raise HTTPException(
            status_code=403,
            detail="Admins have view-only access to the Work Sheet",
        )

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


@api_router.get("/work-items/history")
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


@api_router.post("/work-items/bulk-delete")
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
            # Admins are view-only on the Work Sheet.
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


@api_router.delete("/work-items/{item_id}")
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


async def _hydrate_projects(
    projects: list[dict],
    include_deliverables: bool = True,
) -> list[dict]:
    """
    Hydrate multiple projects using batched MongoDB queries.

    ``include_deliverables=False`` is used by lightweight list consumers
    such as the dashboard, where returning every nested deliverable would
    create an unnecessarily large JSON payload.
    """

    if not projects:
        return []

    project_ids = [p["id"] for p in projects if p.get("id")]
    client_ids = list({p["client_id"] for p in projects if p.get("client_id")})

    deliverables = []
    deliverable_counts = {}
    stage_counts_by_project: dict = {}

    # The clients read doesn't depend on the deliverables read, so the two
    # run together instead of one after the other.
    clients_read = db.clients.find(
        {"id": {"$in": client_ids}},
        {"_id": 0},
    ).to_list(None)

    if include_deliverables:
        # Fetch all deliverables for all projects in ONE query
        deliverables, clients = await asyncio.gather(
            db.deliverables.find(
                {"project_id": {"$in": project_ids}},
                {"_id": 0},
            ).to_list(None),
            clients_read,
        )
    else:
        # List pages only need the counts (in total and per stage), not the
        # full nested documents - which for a few hundred projects is
        # thousands of deliverables and over a megabyte of JSON. The database
        # does the counting and only the totals cross the wire.
        count_rows, clients = await asyncio.gather(
            db.deliverables.aggregate([
                {"$match": {"project_id": {"$in": project_ids}}},
                {"$group": {
                    "_id": {
                        "project_id": "$project_id",
                        "stage": {"$ifNull": ["$current_stage", "Content"]},
                    },
                    "count": {"$sum": 1},
                }},
            ]).to_list(None),
            clients_read,
        )
        for row in count_rows:
            key = row.get("_id") or {}
            pid = key.get("project_id")
            if not pid:
                continue
            count = row.get("count", 0)
            deliverable_counts[pid] = deliverable_counts.get(pid, 0) + count
            per_stage = stage_counts_by_project.setdefault(pid, {})
            per_stage[key.get("stage")] = per_stage.get(key.get("stage"), 0) + count

    # Attach approval configuration without storing it on the deliverable document.
    if deliverables:
        approval_rows = await db.approval_workflows.find(
            {"deliverable_id": {"$in": [d["id"] for d in deliverables]}},
            {"_id": 0, "deliverable_id": 1, "required_types": 1},
        ).to_list(None)
        approval_types_by_deliverable = {
            row["deliverable_id"]: row.get("required_types", [])
            for row in approval_rows
        }
        for d in deliverables:
            d["approval_types"] = approval_types_by_deliverable.get(d["id"], [])

    # Index deliverables by project
    deliverables_by_project = {}

    for d in deliverables:
        project_id = d.get("project_id")

        if not project_id:
            continue

        deliverables_by_project.setdefault(project_id, []).append(d)

    # Index clients by id
    clients_by_id = {
        client.get("id"): client
        for client in clients
        if client.get("id")
    }

    hydrated = []

    for p in projects:
        project_id = p.get("id")
        client_doc = clients_by_id.get(p.get("client_id"))

        project_deliverables = (
            deliverables_by_project.get(project_id, [])
            if include_deliverables
            else []
        )

        stage_counts = {s: 0 for s in STAGES}
        collaborators = set()

        if include_deliverables:
            for d in project_deliverables:
                stage = d.get("current_stage", "Content")

                stage_counts[stage] = stage_counts.get(stage, 0) + 1
        else:
            for stage, count in stage_counts_by_project.get(project_id, {}).items():
                stage_counts[stage] = stage_counts.get(stage, 0) + count

        # Resolve client POC.
        # Keep the existing fallback behaviour:
        # selected contact person -> client's default contact_person.
        client_poc = ""

        if client_doc and not p.get("poc_none"):
            client_poc = next(
                (
                    c.get("name", "")
                    for c in (client_doc.get("contact_persons") or [])
                    if c.get("id") == p.get("poc_id")
                ),
                client_doc.get("contact_person", ""),
            )

        hydrated.append(
            {
                **p,
                "deliverables": project_deliverables,
                "deliverables_count": (
                    len(project_deliverables)
                    if include_deliverables
                    else deliverable_counts.get(project_id, 0)
                ),
                "stage_counts": stage_counts,
                "collaborator_ids": list(collaborators),
                "client_name": (
                    client_doc.get("name", "")
                    if client_doc
                    else ""
                ),
                "client_poc": client_poc,
            }
        )

    return hydrated


async def _hydrate_project(p: dict) -> dict:
    """
    Hydrate a single project.

    Used by the project detail endpoint.
    """
    hydrated = await _hydrate_projects([p])

    return hydrated[0] if hydrated else p


@api_router.get("/projects")
async def list_projects(
    request: Request,
    status: Optional[str] = None,
    search: Optional[str] = None,
    visibility: Optional[str] = "visible",
    limit: int = PROJECT_LIST_LIMIT,
    include_deliverables: bool = False,
):
    user = await get_acting_user(request)

    # Projects are visible to every role, but hiding a project is an admin
    # action, so the hidden/all views stay admin-only. Anyone else asking for
    # them just gets the normal visible list.
    if user.role != "admin":
        visibility = "visible"

    query = {}
    and_clauses = []

    if visibility == "visible":
        and_clauses.append({
            "$or": [
                {"hidden": False},
                {"hidden": {"$exists": False}},
            ]
        })
    elif visibility == "hidden":
        query["hidden"] = True
    elif visibility == "all":
        pass
    else:
        raise HTTPException(
            status_code=400,
            detail="Invalid visibility"
        )

    if status:
        query["status"] = status

    if search:
        and_clauses.extend(search_clauses(search, ["name", "code"]))

    if and_clauses:
        query["$and"] = and_clauses

    limit = max(1, min(limit, PROJECT_LIST_LIMIT))

    # batch_size: otherwise the driver returns 101 projects and then makes one
    # more round trip to the database per following batch.
    projects = await db.projects.find(
        query,
        {"_id": 0},
    ).sort("created_at", -1).batch_size(limit).to_list(limit)

    return await _hydrate_projects(
        projects,
        include_deliverables=include_deliverables,
    )


@api_router.get("/projects/metrics")
async def project_metrics(request: Request):
    await get_acting_user(request)
    today = datetime.now(timezone.utc).date()
    # Same numbers for everyone, and they depend on the day: one shared copy.
    return await cached_read(
        f"project-metrics:{today.isoformat()}", lambda: _project_metrics(today)
    )


async def _project_metrics(today) -> dict:
    # Only two fields per project are needed, and the deliverable total is
    # just a count - this used to download every project and every
    # deliverable document (capped at 5000) only to take len() of the list.
    # The two reads don't depend on each other, so run them together.
    projects, total_deliverables = await asyncio.gather(
        db.projects.find({}, {"_id": 0, "status": 1, "end_date": 1}).to_list(None),
        db.deliverables.count_documents({}),
    )
    week_end = today + timedelta(days=7)
    active = sum(1 for p in projects if p.get("status") == "Active")
    in_rework = sum(1 for p in projects if p.get("status") == "In Rework")
    due_this_week = 0
    for p in projects:
        try:
            d = datetime.fromisoformat(p.get("end_date")).date()
            if today <= d <= week_end and p.get("status") != "Completed":
                due_this_week += 1
        except (ValueError, TypeError):
            continue
    return {
        "active_projects": active,
        "in_rework": in_rework,
        "due_this_week": due_this_week,
        "total_deliverables": total_deliverables,
    }


def _date_prefix(moment: datetime) -> str:
    """YYYY-MM-DD of `moment`, for a coarse string comparison against the ISO
    timestamps stored on projects (whose formats differ after the date)."""
    return moment.astimezone(timezone.utc).date().isoformat()


async def _projects_touched_since(client_id: Optional[str], since: datetime) -> list:
    """Projects of one client that were created or changed on or after the day of
    `since`. A coarse first cut by day; project_duplicates does the exact test."""
    day = _date_prefix(since)
    return await db.projects.find(
        {
            "client_id": client_id or None,
            "$or": [{"created_at": {"$gte": day}}, {"updated_at": {"$gte": day}}],
        },
        {"_id": 0, "id": 1, "code": 1, "name": 1, "client_id": 1, "status": 1,
         "start_date": 1, "end_date": 1, "created_at": 1, "updated_at": 1, "hidden": 1},
    ).to_list(1000)


@api_router.get("/projects/duplicate-check")
async def check_project_duplicates(client_id: str, name: str, request: Request):
    """Projects for this client with the same name that were created or changed
    in the last 30 days. Only informs: creating a project never waits on it, since
    a same-named project can be a genuine repeat (a monthly brochure) as easily as
    a double entry. Declared before /projects/{project_id} so it is not read as one."""
    await require_admin(request)
    now = datetime.now(timezone.utc)
    window = project_duplicates.DUPLICATE_WINDOW_DAYS
    candidates = await _projects_touched_since(client_id, now - timedelta(days=window))
    return {
        "window_days": window,
        "duplicates": project_duplicates.find_recent_duplicates(candidates, client_id, name, now, window),
    }


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    # Project detail is read-only for everyone; every write endpoint below
    # (create / update / hide / delete / import) stays admin-only.
    await get_acting_user(request)
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _hydrate_project(p)


PROJECT_WORK_LOG_CAP = 500


@api_router.get("/projects/{project_id}/work-log")
async def get_project_work_log(project_id: str, request: Request):
    """Everything the project page's Work Log needs, in ONE query.

    Replaces two full /work-items downloads (by project_id, then by
    deliverable_id) that returned every field of every row. The table only
    shows eight columns, so only those are read, the newest
    PROJECT_WORK_LOG_CAP rows are sent, and `total` says how many exist.
    """
    await get_acting_user(request)

    deliverable_ids = [
        d["id"]
        async for d in db.deliverables.find({"project_id": project_id}, {"_id": 0, "id": 1})
        if d.get("id")
    ]
    match = {"$or": [{"project_id": project_id}]}
    if deliverable_ids:
        # Rows whose project_id is blank/wrong but which belong to one of this
        # project's deliverables (older/imported rows) still show up.
        match["$or"].append({"deliverable_id": {"$in": deliverable_ids}})

    total = await db.work_items.count_documents(match)
    # Hours logged across ALL of the project's rows (not just the capped page
    # below) - the project header shows it next to the progress bar.
    minutes_rows = await db.work_items.aggregate([
        {"$match": match},
        {"$group": {"_id": None, "minutes": {"$sum": {"$ifNull": ["$time_taken_minutes", 0]}}}},
    ]).to_list(1)
    total_minutes = minutes_rows[0]["minutes"] if minutes_rows else 0
    items = (
        await db.work_items
        .find(
            match,
            {
                "_id": 0,
                "id": 1,
                "work_date": 1,
                "stage": 1,
                "deliverable_name": 1,
                "creator_id": 1,
                "time_taken_minutes": 1,
                "status": 1,
            },
        )
        .sort([("work_date", -1), ("created_at", -1)])
        .limit(PROJECT_WORK_LOG_CAP)
        .batch_size(PROJECT_WORK_LOG_CAP)
        .to_list(PROJECT_WORK_LOG_CAP)
    )
    return {"items": items, "total": total, "total_minutes": total_minutes}


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


@api_router.post("/projects")
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


async def _notify_new_project_safely(project: dict, deliverables: list[dict], **kwargs):
    """Run _notify_new_project as a background task: it must never raise
    into the event loop, and a notification problem must not be able to fail
    a project that was already created."""
    try:
        await _notify_new_project(project, deliverables, **kwargs)
    except Exception:
        logger.exception("Could not send new-project notifications")


@api_router.patch("/projects/{project_id}")
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


@api_router.post("/projects/{project_id}/hide")
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


@api_router.post("/projects/{project_id}/unhide")
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


@api_router.post("/projects/bulk-hide")
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


@api_router.post("/projects/bulk-unhide")
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


@api_router.post("/projects/reorder")
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


@api_router.post("/projects/bulk-status")
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


@api_router.post("/projects/bulk-delete")
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


@api_router.delete("/projects/{project_id}")
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


@api_router.get("/deliverables", response_model=List[Deliverable])
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


@api_router.post("/deliverables", response_model=Deliverable)
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


@api_router.post("/projects/{project_id}/deliverables/import")
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


@api_router.patch("/deliverables/{deliverable_id}", response_model=Deliverable)
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


@api_router.delete("/deliverables/{deliverable_id}")
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


# ---------------- Team management (admin) ----------------
@api_router.post("/users", response_model=User)
async def create_user(payload: UserCreate, request: Request):
    await require_admin(request)
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if not payload.department or payload.department not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Department required")

    username = payload.username.strip().lower()
    email = payload.email.strip().lower()

    if not username:
        raise HTTPException(status_code=400, detail="Username required")

    if not email:
        raise HTTPException(status_code=400, detail="Email required")

    if len(payload.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters",
        )

    existing_username = await db.users.find_one({"username": username})
    if existing_username:
        raise HTTPException(
            status_code=400,
            detail="Username already exists",
        )

    role_prefix = payload.role
    uid = f"{role_prefix}-{uuid.uuid4().hex[:6]}"
    doc = {
        "id": uid,
        "name": payload.name.strip(),
        "username": username,
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": payload.role,
        "department": payload.department or "",
        "active": payload.active if payload.active is not None else True,
    }
    await db.users.insert_one(doc)
    return User(**doc)


@api_router.patch("/users/{user_id}", response_model=User)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    request: Request
):
    await require_admin(request)

    existing = await db.users.find_one(
        {"id": user_id},
        {"_id": 0}
    )

    if not existing:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    update_fields = payload.model_dump(
        exclude_unset=True
    )

    # Username
    if "username" in update_fields:
        username = (
            update_fields["username"] or ""
        ).strip().lower()

        if not username:
            raise HTTPException(
                status_code=400,
                detail="Username required"
            )

        existing_username = await db.users.find_one(
            {
                "username": username,
                "id": {"$ne": user_id}
            }
        )

        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="Username already exists"
            )

        update_fields["username"] = username

    # Email
    if "email" in update_fields:
        email = (
            update_fields["email"] or ""
        ).strip().lower()

        if not email:
            raise HTTPException(
                status_code=400,
                detail="Email required"
            )

        update_fields["email"] = email

    # Name
    if "name" in update_fields:
        name = (
            update_fields["name"] or ""
        ).strip()

        if not name:
            raise HTTPException(
                status_code=400,
                detail="Name required"
            )

        update_fields["name"] = name

    # Role
    if "role" in update_fields:
        if update_fields["role"] not in ROLES:
            raise HTTPException(
                status_code=400,
                detail="Invalid role"
            )

    # Department
    if "department" in update_fields:
        if (
            not update_fields["department"]
            or update_fields["department"] not in DEPARTMENTS
        ):
            raise HTTPException(
                status_code=400,
                detail="Department required"
            )

    # Password
    # Only change it when a new password was supplied.
    if "password" in update_fields:
        password = update_fields.pop("password")

        if password:
            if len(password) < 8:
                raise HTTPException(
                    status_code=400,
                    detail="Password must be at least 8 characters"
                )

            update_fields["password_hash"] = hash_password(
                password
            )

    await db.users.update_one(
        {"id": user_id},
        {"$set": update_fields}
    )
    _invalidate_cached_user(user_id)

    updated = await db.users.find_one(
        {"id": user_id},
        {"_id": 0}
    )

    return User(**updated)


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
ANY_MANAGER_APPROVAL_TYPES = ["LEADERSHIP", "CLIENT_SPOC", "COMPLIANCE"]


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
@api_router.get("/bulk-review/count")
async def bulk_review_count(request: Request):
    """Lightweight count for the Bulk Review button's badge — same scoping
    as GET /bulk-review, without fetching/hydrating the actual rows."""
    user = await get_acting_user(request)

    if user.role not in ("admin", "manager"):
        return {"count": 0}

    # Managers and admins only see work explicitly assigned to them as reviewer.
    query = {"status": "Ready for Review", "reviewer_id": user.id}

    async def compute():
        return {"count": await db.work_items.count_documents(query)}

    return await cached_read(f"bulk-review-count:{user.id}", compute)


@api_router.get("/bulk-review")
async def list_bulk_review(request: Request):
    """Work items assigned to the logged-in manager or admin and ready for review."""
    user = await get_acting_user(request)

    if user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=403,
            detail="Only admin or manager can access bulk review"
        )

    # Managers and admins only see work explicitly assigned to them as the
    # reviewer (members often pick an admin as reviewer).
    query = {
        "status": "Ready for Review",
        "reviewer_id": user.id,
    }

    items = await db.work_items.find(
        query,
        {"_id": 0}
    ).sort("updated_at", -1).to_list(500)

    project_ids = list({
        item["project_id"]
        for item in items
        if item.get("project_id")
    })

    projects = {
        p["id"]: p
        for p in await db.projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0}
        ).to_list(500)
    }

    users = {
        u["id"]: u
        for u in await db.users.find(
            {},
            {"_id": 0}
        ).to_list(500)
    }

    clients = {
        c["id"]: c
        for c in await db.clients.find(
            {},
            {"_id": 0}
        ).to_list(500)
    }

    # Deadline of the stage each row is in (falls back to the deliverable's
    # overall end date), so the review list can show who is overdue.
    deliverable_ids = list({
        item["deliverable_id"]
        for item in items
        if item.get("deliverable_id")
    })
    deliverables = {
        d["id"]: d
        for d in await db.deliverables.find(
            {"id": {"$in": deliverable_ids}},
            {"_id": 0, "id": 1, "stage_schedule": 1, "end_dt": 1},
        ).to_list(len(deliverable_ids) or 1)
    }

    result = []

    for item in items:
        project = projects.get(item.get("project_id") or "") or {}
        creator = users.get(item.get("creator_id") or "") or {}
        reviewer = users.get(item.get("reviewer_id") or "") or {}
        client = clients.get(project.get("client_id") or "") or {}
        deliverable = deliverables.get(item.get("deliverable_id") or "") or {}
        stage_window = (deliverable.get("stage_schedule") or {}).get(item.get("stage")) or {}

        result.append({
            **item,
            "due_date": stage_window.get("end_dt") or deliverable.get("end_dt"),
            "project_name": project.get("name", ""),
            "project_code": project.get("code", ""),
            "client_name": client.get("name", ""),
            "creator_name": creator.get("name", "Unknown"),
            "reviewer_name": reviewer.get("name", "Unassigned"),
        })

    return result


async def _build_implicit_manager_items(user: User, count_only: bool = False):
    """Build manager approvals for ready deliverables without workflows.

    ``count_only=True`` is for the sidebar badge: it needs how many items
    there are, not their contents, so only the two fields the filtering looks
    at are read (whole deliverable documents were being pulled on every poll).
    """

    if user.role not in ("admin", "manager", "member"):
        return []

    # Fetch ready deliverables once.
    ready = await db.deliverables.find(
        {"stage_status": "Ready for Review"},
        {"_id": 0, "id": 1, "current_stage": 1} if count_only else {"_id": 0},
    ).sort(
        "updated_at",
        -1,
    ).to_list(500)

    if not ready:
        return []

    deliverable_ids = [d["id"] for d in ready]

    # Fetch all existing workflows in ONE query.
    workflows = await db.approval_workflows.find(
        {"deliverable_id": {"$in": deliverable_ids}},
        {"_id": 0, "deliverable_id": 1},
    ).to_list(len(deliverable_ids))

    workflow_deliverable_ids = {
        w["deliverable_id"]
        for w in workflows
        if w.get("deliverable_id")
    }

    candidates = [
        d
        for d in ready
        if d["id"] not in workflow_deliverable_ids
    ]

    # Managers only see approvals for their production stage.
    if user.role == "manager":
        stage_to_department = {
            "Content": "Content",
            "Design": "Design",
            "Animate": "Animation",
        }

        candidates = [
            d
            for d in candidates
            if stage_to_department.get(d.get("current_stage")) == user.department
        ]

    candidates = [d for d in candidates if _member_can_view_approval(user, d)]

    return [
        {
            "id": f"implicit-manager-{d['id']}",
            "approval_workflow_id": None,
            "deliverable_id": d["id"],
            "approval_type": "MANAGER",
            "status": "PENDING",
            "assigned_to": None,
            "department": user.department,
            "requested_at": d.get("updated_at"),
            "approved_at": None,
            "sent_back_at": None,
            "approved_by": None,
            "sent_back_by": None,
            "comments": "",
            "hidden": False,
            "hidden_at": None,
            "hidden_by": None,
            "created_at": d.get("created_at"),
            "updated_at": d.get("updated_at"),
        }
        for d in candidates
    ]
@api_router.get("/approvals")
async def list_approvals(request: Request):
    """Return actionable approval items."""

    user = await get_acting_user(request)

    query = {"status": "PENDING"}

    if not _approvals_view_all(user):
        query["$or"] = [
            {"assigned_to": user.id},
            {
                "approval_type": "MANAGER",
                "assigned_to": None,
            },
            {
                "approval_type": {"$in": ANY_MANAGER_APPROVAL_TYPES},
                "assigned_to": None,
            },
        ]

    items = await db.approval_items.find(
        query,
        {"_id": 0},
    ).sort(
        "updated_at",
        -1,
    ).to_list(500)

    implicit_items = await _build_implicit_manager_items(user)
    items.extend(implicit_items)

    hydrated = await _hydrate_approval_items(items)

    # Admins and members can see all approval items (read-only).
    # No permission query is required for every item.
    if _approvals_view_all(user):
        visible = [
            item for item in hydrated
            if _member_can_view_approval(user, item.get("_deliverable"))
        ]
        for item in visible:
            item.pop("_deliverable", None)
        return visible

    # For managers, permission checks are still required,
    # but deliverables are already available from hydration.
    result = []

    for item in hydrated:
        deliverable = item.get("_deliverable")

        if deliverable and await _approval_item_can_act(
            user,
            item,
            deliverable,
        ):
            result.append(item)

    for item in result:
        item.pop("_deliverable", None)

    return result


def _approval_visibility_query(user: User, visibility: str) -> dict:
    """The Mongo filter behind what a user's Approvals board may contain.
    Shared by the board and the sidebar badge so the two cannot drift."""
    query = {"status": "PENDING"}
    clauses = []

    if visibility == "visible":
        clauses.append({"$or": [{"hidden": False}, {"hidden": {"$exists": False}}]})
    elif visibility == "hidden":
        query["hidden"] = True
    elif visibility == "all":
        pass
    else:
        raise HTTPException(status_code=400, detail="Invalid visibility")

    if not _approvals_view_all(user):
        clauses.append({
            "$or": [
                {"assigned_to": user.id},
                {
                    "approval_type": "MANAGER",
                    "assigned_to": None,
                },
                {
                    "approval_type": {"$in": ANY_MANAGER_APPROVAL_TYPES},
                    "assigned_to": None,
                },
            ]
        })

    if clauses:
        query["$and"] = clauses

    return query


@api_router.get("/approvals/pending-count")
async def approval_pending_count(request: Request):
    """Count for the sidebar's Approvals badge.

    This must equal the number of cards GET /approvals/board would show for
    the same user. The Mongo query alone is only a coarse pre-filter: a
    manager's MANAGER approvals are further restricted to deliverables that
    are currently in their own department's stage (_approval_item_can_act).
    Counting without that check made the badge show approvals the manager
    could never see on their board - the "count says N, board shows fewer"
    mismatch - so each candidate is now run through the same check, using
    one batched deliverable lookup instead of full board hydration."""
    user = await get_acting_user(request)

    # Heaviest call the sidebar polls, and a person's own actions drop the cache
    # (see read_cache.bump), so the badge still updates the moment they act.
    return await cached_read(
        f"approvals-pending:{user.id}", lambda: _approval_pending_count(user)
    )


async def _approval_pending_count(user: User) -> dict:
    query = _approval_visibility_query(user, "visible")

    async def explicit_count() -> int:
        if _approvals_view_all(user) and _member_approval_stage(user) is None:
            # Nothing to check per item, so the database can just count (still
            # capped at the 500 the board itself loads).
            return await db.approval_items.count_documents(query, limit=500)

        # Only the fields the per-item check reads, not whole documents.
        items = await db.approval_items.find(
            query,
            {"_id": 0, "deliverable_id": 1, "assigned_to": 1, "approval_type": 1},
        ).to_list(500)

        deliverable_ids = list({
            item.get("deliverable_id")
            for item in items
            if item.get("deliverable_id")
        })
        deliverables = {
            d["id"]: d
            for d in await db.deliverables.find(
                {"id": {"$in": deliverable_ids}},
                {"_id": 0, "id": 1, "current_stage": 1},
            ).to_list(len(deliverable_ids) or 1)
        }

        count = 0
        for item in items:
            deliverable = deliverables.get(item.get("deliverable_id"))
            if not deliverable:
                continue
            if _approvals_view_all(user):
                if _member_can_view_approval(user, deliverable):
                    count += 1
            elif await _approval_item_can_act(user, item, deliverable):
                count += 1
        return count

    # Implicit manager approvals (ready deliverables with no workflow yet)
    # aren't real documents, so they can't be counted with the query above -
    # _build_implicit_manager_items already scopes them to the user (and to
    # the manager's own stage) in batched queries, same as the board. The two
    # parts don't depend on each other, so they run together.
    explicit, implicit = await asyncio.gather(
        explicit_count(),
        _build_implicit_manager_items(user, count_only=True),
    )

    return {"count": explicit + len(implicit)}


@api_router.get("/approvals/board")
async def approval_board(request: Request, visibility: Optional[str] = "visible"):
    """Return pending approval cards grouped by approval authority."""

    user = await get_acting_user(request)

    query = _approval_visibility_query(user, visibility)

    items = await db.approval_items.find(
        query,
        {"_id": 0},
    ).sort(
        "updated_at",
        -1,
    ).to_list(500)

    # Build implicit manager approvals efficiently. These have no real
    # document backing them, so they're always effectively "visible" —
    # excluded whenever the requested visibility is "hidden".
    if visibility != "hidden":
        items.extend(
            (await _build_implicit_manager_items(user))[:200]
        )

    hydrated = await _hydrate_approval_items(items)

    result = {
        key: []
        for key in APPROVAL_TYPES
    }

    for item in hydrated:
        deliverable = item.get("_deliverable")

        if _approvals_view_all(user):
            allowed = _member_can_view_approval(user, deliverable)
        else:
            allowed = (
                deliverable
                and await _approval_item_can_act(
                    user,
                    item,
                    deliverable,
                )
            )

        if allowed:
            result[item["approval_type"]].append(item)

    # Remove internal hydration field.
    for key in result:
        for item in result[key]:
            item.pop("_deliverable", None)

    return result


@api_router.get("/deliverables/{deliverable_id}/approvals")
async def get_deliverable_approvals(deliverable_id: str, request: Request):
    await get_acting_user(request)
    d = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    workflow = await _get_approval_workflow(deliverable_id)
    if not workflow:
        return {"workflow": None, "items": []}
    items = await db.approval_items.find(
        {"approval_workflow_id": workflow["id"]}, {"_id": 0}
    ).sort("created_at", 1).to_list(50)
    return {"workflow": workflow, "items": await _hydrate_approval_items(items)}


@api_router.put("/deliverables/{deliverable_id}/approval-workflow")
async def configure_approval_workflow(deliverable_id: str, payload: ApprovalWorkflowCreate, request: Request):
    user = await require_admin(request)
    d = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    workflow = await _create_or_sync_approval_workflow(d, payload.approval_types, user.id)
    await log_activity(
        collection_name="deliverable_activity_log",
        entity_id=deliverable_id,
        entity_field="deliverable_id",
        action="APPROVAL_WORKFLOW_CONFIGURED",
        changed_by=user.id,
        new_value={"approval_types": payload.approval_types},
    )
    return await get_deliverable_approvals(deliverable_id, request)


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


async def advance_deliverable_stage(
    deliverable: dict,
    reviewer_id: str,
    note: str,
    notify_in_background: bool = False,
):
    ts = now_iso()

    required_stages = (
        deliverable.get("required_stages")
        or [deliverable.get("current_stage", "Content")]
    )

    current_stage = deliverable.get(
        "current_stage",
        required_stages[0],
    )

    next_stage = next_selected_stage(
        current_stage,
        required_stages,
    )

    if next_stage:
        # The deliverable is handed to the next stage's team. A brand-new
        # deliverable starts life as "Ready for Review" on its first stage
        # (see create_project / create_deliverable), which is what puts its
        # approval card on the reviewing manager's board. The hand-off must
        # do the same for the next stage - previously it was set to
        # "Not Started", and nothing in the app ever moves a deliverable back
        # to "Ready for Review" (members cannot, and the admin edit modal
        # shows stage status read-only), so the next stage's approval never
        # appeared on that team's Kanban.
        update = {
            "current_stage": next_stage,
            "stage_status": "Ready for Review",
            "last_review_action": "approved",
            "last_reviewer_id": reviewer_id,
            "last_review_note": note,
            "updated_at": ts,
        }
    else:
        update = {
            "stage_status": "Completed",
            "last_review_action": "approved",
            "last_reviewer_id": reviewer_id,
            "last_review_note": note,
            "updated_at": ts,
        }

    await db.deliverables.update_one(
        {"id": deliverable["id"]},
        {"$set": update},
    )

    workflow = await _get_approval_workflow(
        deliverable["id"]
    )

    if workflow:
        if next_stage:
            # Open a fresh review round for the next stage: every approval
            # authority on this deliverable goes back to PENDING (and is
            # un-hidden) so it shows on the next stage's board.
            await _set_approval_items_pending(deliverable["id"])
        else:
            # Final stage approved: nothing is left to review.
            await _complete_approval_workflow(deliverable["id"])

    updated = await db.deliverables.find_one(
        {"id": deliverable["id"]},
        {"_id": 0},
    )

    if next_stage and updated:
        if notify_in_background:
            # Bulk approvals: don't make the reviewer wait on the
            # notification writes for every deliverable.
            _fire_and_forget(_notify_stage_handoff_safe(updated, next_stage, ts))
        else:
            await _notify_stage_handoff_safe(updated, next_stage, ts)

    return updated


async def _load_approvable_item(user: User, approval_item_id: str, preloaded: Optional[dict] = None):
    """Fetch an approval item (or the synthetic implicit-manager one) plus its
    deliverable and run the checks every approve path shares. Raises
    HTTPException exactly like the single-item endpoint always did."""
    item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
    if not item and approval_item_id.startswith("implicit-manager-"):
        deliverable_id = approval_item_id.removeprefix("implicit-manager-")
        item = {"id": approval_item_id, "deliverable_id": deliverable_id, "approval_type": "MANAGER", "status": "PENDING", "assigned_to": None, "department": user.department}
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    d = (preloaded or {}).get(item["deliverable_id"]) or await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    if item.get("status") != "PENDING":
        raise HTTPException(status_code=400, detail="This approval is not pending")
    if not await _approval_item_can_act(user, item, d):
        raise HTTPException(status_code=403, detail="You are not authorized to approve this item")
    return item, d


async def _apply_approval(user: User, item: dict, d: dict, note: str, notify_in_background: bool = False):
    """Record one approval and advance the deliverable if nothing else is
    pending. Returns the deliverable id. Does NOT build the heavy response."""
    ts = now_iso()
    approval_item_id = item["id"]
    if item.get("approval_workflow_id") is None:
        await advance_deliverable_stage(d, user.id, note, notify_in_background)
    else:
        # Only flip an item that is still PENDING so a duplicate/parallel
        # request cannot approve (and advance the stage) twice.
        res = await db.approval_items.update_one(
            {"id": approval_item_id, "status": "PENDING"},
            {"$set": {"status": "APPROVED", "approved_by": user.id, "approved_at": ts, "comments": note, "updated_at": ts}},
        )
        if res.modified_count == 0:
            raise HTTPException(status_code=400, detail="This approval is not pending")
        pending = await db.approval_items.count_documents(
            {"approval_workflow_id": item["approval_workflow_id"], "status": "PENDING"}
        )
        if pending == 0:
            await advance_deliverable_stage(d, user.id, note, notify_in_background)
    await db.approval_history.insert_one({
        "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
        "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id,
        "comment": note, "created_at": ts,
    })
    return d["id"]


@api_router.post("/approval-items/{approval_item_id}/approve")
async def approve_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
    user = await require_approver(request)
    item, d = await _load_approvable_item(user, approval_item_id)
    await _apply_approval(user, item, d, payload.note or "")
    return await get_deliverable_approvals(d["id"], request)


class ApprovalBulkDecision(BaseModel):
    ids: List[str] = Field(default_factory=list)
    note: Optional[str] = ""


@api_router.post("/approval-items/bulk-approve")
async def bulk_approve_approval_items(payload: ApprovalBulkDecision, request: Request):
    """Approve many items in one request.

    The browser used to fire one POST per card in parallel. Each of those paid
    its own auth lookup, ran the stage hand-off and then rebuilt the full
    approvals payload for the deliverable, and two cards of the same
    deliverable could race each other and advance the stage twice. Here the
    items are de-duplicated, grouped by deliverable (processed one after the
    other so the "nothing pending -> advance" check is reliable) and
    different deliverables run with a small concurrency limit.
    """
    user = await require_approver(request)
    ids = list(dict.fromkeys(i for i in payload.ids if i))[:500]
    if not ids:
        return {"approved": [], "failed": []}
    note = payload.note or ""

    real_ids = [i for i in ids if not i.startswith("implicit-manager-")]
    found = {
        x["id"]: x
        for x in await db.approval_items.find({"id": {"$in": real_ids}}, {"_id": 0}).to_list(len(real_ids) or 1)
    } if real_ids else {}

    def deliverable_of(item_id: str):
        if item_id in found:
            return found[item_id].get("deliverable_id")
        if item_id.startswith("implicit-manager-"):
            return item_id.removeprefix("implicit-manager-")
        return None

    groups: dict = {}
    failed: list = []
    for item_id in ids:
        did = deliverable_of(item_id)
        if not did:
            failed.append({"id": item_id, "detail": "Approval item not found"})
            continue
        groups.setdefault(did, []).append(item_id)

    approved: list = []
    # Each approval is a handful of database round trips, so a wider fan-out
    # across deliverables is what keeps a big selection fast.
    sem = asyncio.Semaphore(16)

    # Every deliverable in one query instead of one lookup per item. A
    # deliverable's own items still run one after the other below, so the
    # copy loaded here is only used for its first item.
    deliverables_by_id = {
        x["id"]: x
        for x in await db.deliverables.find({"id": {"$in": list(groups)}}, {"_id": 0}).to_list(len(groups) or 1)
    } if groups else {}

    async def run_group(item_ids: list):
        async with sem:
            for position, item_id in enumerate(item_ids):
                try:
                    item, d = await _load_approvable_item(
                        user, item_id, deliverables_by_id if position == 0 else None
                    )
                    await _apply_approval(user, item, d, note, notify_in_background=True)
                    approved.append(item_id)
                except HTTPException as exc:
                    failed.append({"id": item_id, "detail": exc.detail})
                except Exception:
                    logger.exception("Bulk approve failed for %s", item_id)
                    failed.append({"id": item_id, "detail": "Approval failed"})

    await asyncio.gather(*(run_group(g) for g in groups.values()))
    return {"approved": approved, "failed": failed}


@api_router.patch("/approval-items/{approval_item_id}/move")
async def move_approval_item(approval_item_id: str, payload: ApprovalMove, request: Request):
    user = await require_approver(request)
    target = payload.approval_type.upper().strip()
    if target not in APPROVAL_TYPES:
        raise HTTPException(status_code=400, detail="Invalid approval type")
    item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
    if not item and approval_item_id.startswith("implicit-manager-"):
        deliverable_id = approval_item_id.removeprefix("implicit-manager-")
        d0 = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
        if not d0:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        await _create_or_sync_approval_workflow(d0, ["MANAGER"], user.id)
        item = await db.approval_items.find_one({"deliverable_id": deliverable_id, "approval_type": "MANAGER"}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    d = await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    if not await _approval_item_can_act(user, item, d):
        raise HTTPException(status_code=403, detail="You are not authorized to move this approval")
    if item.get("approval_type") == target:
        return item
    duplicate = await db.approval_items.find_one({
        "approval_workflow_id": item["approval_workflow_id"],
        "approval_type": target,
        "id": {"$ne": approval_item_id},
    }, {"_id": 0, "id": 1})
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This deliverable already has a {target.replace('_', " " ).title()} approval."
            ),
        )
    ts = now_iso()
    old_type = item.get("approval_type")
    await db.approval_items.update_one(
        {"id": approval_item_id},
        {"$set": {"approval_type": target, "status": "PENDING", "updated_at": ts}},
    )
    workflow = await db.approval_workflows.find_one(
        {"id": item["approval_workflow_id"]},
        {"_id": 0, "required_types": 1},
    )

    required_types = list(workflow.get("required_types", [])) if workflow else []

    if old_type in required_types:
        required_types.remove(old_type)

    if target not in required_types:
        required_types.append(target)

    await db.approval_workflows.update_one(
        {"id": item["approval_workflow_id"]},
        {
            "$set": {
                "required_types": required_types,
                "updated_at": ts,
            }
        },
    )
    await db.approval_history.insert_one({
        "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
        "deliverable_id": d["id"], "action": "MOVED", "performed_by": user.id,
        "comment": "", "old_value": old_type, "new_value": target, "created_at": ts,
    })
    return await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})


async def _resolve_real_approval_item(approval_item_id: str, user: User):
    """
    Hide/unhide need a real document to flag — implicit manager items
    have no backing document, so materialize one first, same as move
    already does.
    """
    item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})

    if item:
        return item

    if not approval_item_id.startswith("implicit-manager-"):
        raise HTTPException(status_code=404, detail="Approval item not found")

    deliverable_id = approval_item_id.removeprefix("implicit-manager-")
    d0 = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})

    if not d0:
        raise HTTPException(status_code=404, detail="Deliverable not found")

    await _create_or_sync_approval_workflow(d0, ["MANAGER"], user.id)

    return await db.approval_items.find_one(
        {"deliverable_id": deliverable_id, "approval_type": "MANAGER"},
        {"_id": 0},
    )


@api_router.post("/approval-items/{approval_item_id}/hide")
async def hide_approval_item(approval_item_id: str, request: Request):
    user = await require_approver(request)

    item = await _resolve_real_approval_item(approval_item_id, user)

    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")

    await db.approval_items.update_one(
        {"id": item["id"]},
        {
            "$set": {
                "hidden": True,
                "hidden_at": now_iso(),
                "hidden_by": user.id,
                "updated_at": now_iso(),
            }
        },
    )

    return {"success": True}


@api_router.post("/approval-items/{approval_item_id}/unhide")
async def unhide_approval_item(approval_item_id: str, request: Request):
    user = await require_approver(request)

    item = await _resolve_real_approval_item(approval_item_id, user)

    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")

    await db.approval_items.update_one(
        {"id": item["id"]},
        {
            "$set": {
                "hidden": False,
                "hidden_at": None,
                "hidden_by": None,
                "updated_at": now_iso(),
            }
        },
    )

    return {"success": True}


@api_router.post("/approval-items/bulk-hide")
async def bulk_hide_approval_items(payload: BulkApprovalItemIdsPayload, request: Request):
    user = await require_approver(request)

    ids = payload.approval_item_ids

    if not ids:
        raise HTTPException(status_code=400, detail="No approvals selected")

    resolved_ids = []

    for approval_item_id in ids:
        item = await _resolve_real_approval_item(approval_item_id, user)

        if item:
            resolved_ids.append(item["id"])

    await db.approval_items.update_many(
        {"id": {"$in": resolved_ids}},
        {
            "$set": {
                "hidden": True,
                "hidden_at": now_iso(),
                "hidden_by": user.id,
                "updated_at": now_iso(),
            }
        },
    )

    return {"success": True, "count": len(resolved_ids)}


@api_router.post("/approval-items/bulk-unhide")
async def bulk_unhide_approval_items(payload: BulkApprovalItemIdsPayload, request: Request):
    user = await require_approver(request)

    ids = payload.approval_item_ids

    if not ids:
        raise HTTPException(status_code=400, detail="No approvals selected")

    await db.approval_items.update_many(
        {"id": {"$in": ids}},
        {
            "$set": {
                "hidden": False,
                "hidden_at": None,
                "hidden_by": None,
                "updated_at": now_iso(),
            }
        },
    )

    return {"success": True, "count": len(ids)}


# Legacy endpoints remain for the existing stage-based Close Stage UI.
@api_router.post("/deliverables/{deliverable_id}/approve")
async def approve_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
    if user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="Only managers and admins can approve")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    # Use the deliverable's own selected pipeline, not the fixed global
    # stage order, so this stays consistent with the Approvals Kanban.
    return await advance_deliverable_stage(existing, user.id, payload.note or "")


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