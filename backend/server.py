from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Query, UploadFile, File, Form
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.gzip import GZipMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError
import asyncio
import json
import time
import math
import threading
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
from pydantic import BaseModel, Field, ConfigDict
from typing import Dict, List, Optional
import uuid
from datetime import datetime, timezone, timedelta

try:
    # Works when the working directory is backend/ (e.g. `uvicorn server:app`)
    from efficiency import create_efficiency_router  # noqa: F401
    import deliverable_import  # noqa: F401
except ImportError:
    # Works when uvicorn imports this as a package member from the repo root
    # (e.g. Render's `uvicorn backend.server:app`)
    from backend.efficiency import create_efficiency_router  # noqa: F401
    from backend import deliverable_import  # noqa: F401


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
# Keep a few connections open and warm. With the default minPoolSize=0 a burst
# of requests (the page-load burst, or after an idle period) has to open brand
# new TLS + auth connections to Atlas, and each of those costs several network
# round trips on top of the query itself.
client = AsyncIOMotorClient(
    mongo_url,
    tlsCAFile=certifi.where(),
    minPoolSize=int(os.environ.get("MONGO_MIN_POOL_SIZE", "5")),
    maxPoolSize=int(os.environ.get("MONGO_MAX_POOL_SIZE", "50")),
)
db = client[os.environ['DB_NAME']]

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
    "Infographic",
    "Brochure",
    "Booklet",
    "Presentation (PPT) - Per Slide",
    "Typeform / Polls / Quiz",
    "Collateral",
    "GIF",
    "Reel / Short Video",
    "Long Video",
    "Data Research and Analysis (SMI)",
    "Data Research and Analysis (Web)",
    "Data Updation",
    "Changes",
    "One Pager",
    "Two Pager",
    "Key Visual",
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

DELIVERABLE_TYPE_CATEGORIES = {
    # Core
    "Other Initiatives": "Core",
    "Client Meets & Discussions": "Core",
    "Team Reviews and Feedback": "Core",
    "Campaign Ideation Plan (Includes Keywords)": "Core",
    "Campaign Ideation Plan (Quantitative Analysis)": "Core",
    "Campaign Ideation Plan (Content Peer Analysis)": "Core",
    "Campaign Ideation Plan (Key Visuals / Taglines)": "Core",
    "Teaser": "Core",
    "Minimalist": "Core",
    "Emailers": "Core",
    "Newsletters": "Core",
    "Carousel": "Core",
    "Infographic": "Core",
    "Brochure": "Core",
    "Booklet": "Core",
    "Presentation (PPT) - Per Slide": "Core",
    "Typeform / Polls / Quiz": "Core",
    "Collateral": "Core",
    "GIF": "Core",
    "Reel / Short Video": "Core",
    "Long Video": "Core",
    "Data Research and Analysis (SMI)": "Core",
    "Data Research and Analysis (Web)": "Core",
    "Data Updation": "Core",
    "Changes": "Core",
    "One Pager": "Core",
    "Two Pager": "Core",
    "Key Visual": "Core",
    "Teaser Short Video": "Core",

    # Non-Core
    "Project Briefing": "Non-Core",
    "Campaign Ideation Discussions": "Non-Core",
    "Clarity / Query / Doubt / Feedback Discussions": "Non-Core",
    "Core Team / Content Team / CEO Discussions": "Non-Core",
    "Trainings / Committee / Reviews Meetings": "Non-Core",
    "SOP and Process Improvements - Documentation": "Non-Core",
    "Hiring and Interviews": "Non-Core",
    "Follow Up (Over 10-15 mins)": "Non-Core",
}

STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Changes Requested", "Rework", "Closed"]
# "On Hold" is a pause a member can set on their own row (e.g. waiting on a
# client), same as Ongoing/Ready for Review - it does not need a reviewer.
MEMBER_FORWARD_STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review"]
MEMBER_EDITABLE_FIELDS = {"work_date", "version", "time_taken_minutes", "remarks", "status", "client_id", "project_id", "deliverable_id", "deliverable_not_available", "stage", "deliverable_name", "deliverable_type", "deliverable_link", "reviewer_id", "work_category"}

PROJECT_STATUSES = [
    "Active",
    "Approval Pending",
    "Completed",
    "Ready for Invoice",
    "Raised Invoice",
    "On Hold",
    "Scrapped",
]
STAGES = ["Content", "Design", "Animate"]


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
CLIENT_STATUSES = ["Active", "Inactive"]
DEPARTMENTS = ["Content", "Design", "Animation", "Administration"]
ROLES = ["admin", "manager", "member"]
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
    quantity: float = 1.0
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
    created_at: str
    updated_at: str


class WorkItemCreate(BaseModel):
    work_date: Optional[str] = None
    deliverable_name: Optional[str] = ""
    deliverable_type: Optional[str] = ""
    deliverable_link: Optional[str] = ""
    work_category: Optional[str] = "Core"
    version: Optional[str] = ""
    time_taken_minutes: Optional[float] = 0
    quantity: Optional[float] = 1.0
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


class Client(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: f"client-{uuid.uuid4().hex[:8]}")
    name: str
    # Legacy field - kept temporarily for backward compatibility
    contact_person: str = ""
    # New multiple-contact structure
    contact_persons: List[dict] = Field(default_factory=list)
    status: str = "Active"


class ClientCreate(BaseModel):
    name: str
    # Legacy field - kept temporarily for backward compatibility
    contact_person: Optional[str] = ""
    # New multiple-contact structure
    contact_persons: Optional[List[dict]] = Field(default_factory=list)
    status: Optional[str] = "Active"


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
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: str
    end_date: str
    status: Optional[str] = "Active"
    deliverables: Optional[List[DeliverableInput]] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
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
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: str
    end_date: str
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


def validate_work_category_rules(merged: dict):
    """
    Efficiency rules for work items.

    Core     -> only counts toward productivity when status == "Closed"
                (enforced at read time in the efficiency module).
    Non-Core -> time_taken_minutes is mandatory and must be > 0 before the row
                can be closed. Blank draft rows stay editable.
    """
    category = merged.get("work_category")
    if not category:
        category = DELIVERABLE_TYPE_CATEGORIES.get(merged.get("deliverable_type") or "")

    if category == "Non-Core" and merged.get("status") == "Closed":
        minutes = merged.get("time_taken_minutes") or 0
        if float(minutes) <= 0:
            raise HTTPException(
                status_code=400,
                detail="Non-core work needs time taken (in minutes) before it can be closed",
            )


# ---------------- Time taken: mandatory, auto-filled, always safe ----------------
#
# Time (minutes) on a work row feeds the efficiency formula: Non-Core minutes are
# subtracted from the month's working hours to get Core hours, and Core hours drive
# every activity's potential. So the value has to be a sane number, always.
#
#   * Every row that leaves "Not Started" must carry time > 0.
#   * When a deliverable type is chosen, time is filled from the worker's own
#     benchmark for that activity (their efficiency target) - no typing needed.
#   * It stays editable for edge cases. An edited value is remembered as "manual" so
#     picking another type later does not silently overwrite it.
#   * Whatever is typed must be a finite number, never negative, never more than 24 h
#     for one row - so a typo (or NaN) can never poison a month's totals.
MAX_WORK_ITEM_MINUTES = 1440.0
TIME_GATED_STATUSES = {"Ongoing", "Ready for Review"}
TIME_REQUIRED_MESSAGE = (
    "Please enter the time taken (in minutes) before moving this row forward."
)


def _valid_minutes(value) -> Optional[float]:
    """A finite float, or None for anything that is not a usable number."""
    if value is None or isinstance(value, bool):
        return None
    try:
        minutes = float(value)
    except (TypeError, ValueError):
        return None
    return minutes if math.isfinite(minutes) else None


async def get_time_benchmark(user_ids: list, deliverable_type: Optional[str]) -> Optional[float]:
    """Minutes-per-unit the first of `user_ids` has set for this activity, or None.
    Only Core activities have targets, so Non-Core types never have a benchmark."""
    if not deliverable_type:
        return None
    seen = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        doc = await db.efficiency_employee_targets.find_one(
            {"user_id": uid, "activity_name": deliverable_type, "active": {"$ne": False}},
            {"_id": 0, "time_per_unit_minutes": 1},
        )
        minutes = _valid_minutes((doc or {}).get("time_per_unit_minutes"))
        if minutes and minutes > 0:
            return round(minutes, 2)
    return None


def _time_worker_ids(user, existing: dict, creator_id: Optional[str]) -> list:
    """Whose benchmark applies. Members log their own work (the acting user);
    a manager editing a row is reviewing someone else's, so the row's creator
    comes first."""
    creator = creator_id or existing.get("creator_id")
    return [user.id, creator] if user.role == "member" else [creator, user.id]


async def apply_time_rules(user, existing: dict, update_fields: dict, creator_id: Optional[str] = None) -> None:
    """Validate `time_taken_minutes`, auto-fill it from the benchmark and enforce
    "time is required before a row moves forward". Mutates update_fields; raises
    HTTPException(400) on a violation. `existing` is {} when creating."""
    time_in_patch = "time_taken_minutes" in update_fields

    if time_in_patch:
        raw = update_fields["time_taken_minutes"]
        minutes = 0.0 if raw is None else _valid_minutes(raw)
        if minutes is None or minutes < 0:
            raise HTTPException(
                status_code=400,
                detail="Time taken must be a number of minutes (0 or more).",
            )
        if minutes > MAX_WORK_ITEM_MINUTES:
            raise HTTPException(
                status_code=400,
                detail="Time for a single row cannot exceed 24 hours (1440 minutes). Split it across rows.",
            )
        update_fields["time_taken_minutes"] = round(minutes, 2)

    new_type = update_fields.get("deliverable_type", existing.get("deliverable_type")) or ""
    old_type = existing.get("deliverable_type") or ""
    type_changed = "deliverable_type" in update_fields and new_type != old_type
    new_status = update_fields.get("status")
    moving_forward = new_status in TIME_GATED_STATUSES and new_status != existing.get("status")

    if not (time_in_patch or type_changed or moving_forward):
        return

    current = (
        update_fields["time_taken_minutes"]
        if time_in_patch
        else (_valid_minutes(existing.get("time_taken_minutes")) or 0.0)
    )
    source = existing.get("time_source") or "manual"

    benchmark = None
    if new_type:
        benchmark = await get_time_benchmark(_time_worker_ids(user, existing, creator_id), new_type)

    if time_in_patch:
        if current <= 0 and benchmark:
            # Clearing the box means "go back to my benchmark", never "leave it empty".
            current, source = benchmark, "auto"
        elif benchmark and abs(current - benchmark) < 0.01:
            source = "auto"
        else:
            source = "manual"
    elif type_changed:
        if not new_type or not benchmark:
            # An auto value belonged to the OLD type. Leaving it would count, say,
            # 120 minutes of "Collateral" as time spent on a meeting - so reset it.
            if source == "auto":
                current, source = 0.0, "manual"
        elif current <= 0 or source == "auto":
            current, source = benchmark, "auto"
        # else: a person typed this value; keep it (edge case), only the benchmark moves.

    if moving_forward and current <= 0:
        if benchmark:
            current, source = benchmark, "auto"
        else:
            raise HTTPException(status_code=400, detail=TIME_REQUIRED_MESSAGE)

    update_fields["time_taken_minutes"] = current
    update_fields["time_source"] = source
    update_fields["time_benchmark_minutes"] = benchmark


MIN_WORK_DATE = "2000-01-01"
MAX_WORK_DATE = "2100-12-31"


def validate_work_date(value: str) -> None:
    """A saved work_date must be a real YYYY-MM-DD date between 2000 and 2100.
    A half-typed year in a date field (0002, 0006...) used to be saved as-is,
    which sorted the row to the very bottom and put it in a nonsense month."""
    parsed = None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        pass

    if (
        parsed is None
        or f"{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}" != value
        or not (MIN_WORK_DATE <= value <= MAX_WORK_DATE)
    ):
        raise HTTPException(
            status_code=400,
            detail="Work date must be a valid date between 2000 and 2100.",
        )


# Moving a row out of "Not Started" needs a deliverable (or "Not available").
# Reviewer statuses (Changes Requested / Rework / Closed) are deliberately not
# gated: a reviewer must not be blocked by a gap the creator left.
DELIVERABLE_GATED_STATUSES = {"Ongoing", "Ready for Review"}


def deliverable_required_for(merged: dict) -> bool:
    """A deliverable is expected on client work: rows that have a project and
    are not Non-Core (meetings, hiring, trainings...). Rows with no project
    have no deliverable list to choose from, so they are exempt."""
    if not merged.get("project_id"):
        return False
    category = merged.get("work_category")
    if not category:
        category = DELIVERABLE_TYPE_CATEGORIES.get(merged.get("deliverable_type") or "")
    return category != "Non-Core"


def apply_deliverable_rules(existing: dict, update_fields: dict) -> None:
    """Keep deliverable_id / deliverable_not_available consistent and enforce
    the compulsory-deliverable rule. Mutates update_fields; raises
    HTTPException(400) on a violation. `existing` is {} when creating."""
    if "deliverable_not_available" in update_fields:
        update_fields["deliverable_not_available"] = bool(update_fields["deliverable_not_available"])

    if update_fields.get("deliverable_id"):
        # A real deliverable always wins over the "Not available" flag.
        update_fields["deliverable_not_available"] = False
    elif update_fields.get("deliverable_not_available"):
        update_fields["deliverable_id"] = None
    elif "deliverable_not_available" not in update_fields and (
        "deliverable_id" in update_fields  # explicitly cleared
        or update_fields.get("project_id", existing.get("project_id")) != existing.get("project_id")
        or update_fields.get("client_id", existing.get("client_id")) != existing.get("client_id")
    ):
        # Clearing the deliverable, or moving the row to another project or
        # client, invalidates a previous "Not available" choice.
        update_fields["deliverable_not_available"] = False

    merged = {**existing, **update_fields}

    if merged.get("deliverable_not_available") and not merged.get("project_id"):
        raise HTTPException(
            status_code=400,
            detail="Select a project before marking the deliverable as Not available.",
        )

    new_status = update_fields.get("status")
    if (
        new_status in DELIVERABLE_GATED_STATUSES
        and new_status != existing.get("status")
        and deliverable_required_for(merged)
        and not (merged.get("deliverable_id") or merged.get("deliverable_not_available"))
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please select a deliverable (or choose 'Not available') "
                "before moving this row forward."
            ),
        )


async def scoped_update_fields(
    user: User,
    existing: dict,
    update_fields: dict,
    creator_department: Optional[str] = None,
    creator_role: Optional[str] = None,
) -> dict:
    """Apply role-based restrictions to a raw update payload. Raises HTTPException on violation."""
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    if user.role == "member":
        # A row with a named creator is theirs alone - a teammate (same
        # department, same stage) can no longer edit it, regardless of
        # whether that creator is a member, manager, or admin. Only a row
        # with NO creator at all (e.g. "Add N Rows" provisioning blank team
        # rows, which now leaves creator_id empty for that reason - see
        # bulk_create_work_items) stays open to the whole department.
        creator_id = existing.get("creator_id")
        if creator_id and creator_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="This row was created by a teammate, so only they (or a manager) can edit it.",
            )
        # Members share rows within their department/stage otherwise.
        department_stage = {
            "Content": "Content",
            "Design": "Design",
            "Animation": "Animate",
        }.get(user.department)
        if existing.get("stage") and department_stage and existing.get("stage") != department_stage:
            raise HTTPException(status_code=403, detail="You can only edit work items in your department")
        update_fields = {k: v for k, v in update_fields.items() if k in MEMBER_EDITABLE_FIELDS}
        if "stage" in update_fields and department_stage and update_fields["stage"] != department_stage:
            raise HTTPException(status_code=403, detail="Members can only assign work to their department")
    elif user.role == "manager":
        if not creator_department or creator_department != user.department:
            raise HTTPException(status_code=403, detail="You can only edit work items logged by your own department")
    if "client_id" in update_fields and update_fields["client_id"]:
        client = await db.clients.find_one({"id": update_fields["client_id"]}, {"_id": 0, "id": 1})
        if not client:
            raise HTTPException(status_code=400, detail="Invalid client")

    if "project_id" in update_fields and update_fields["project_id"]:
        project = await db.projects.find_one(
            {"id": update_fields["project_id"]},
            {"_id": 0, "client_id": 1},
        )
        if not project:
            raise HTTPException(status_code=400, detail="Invalid project")
        project_client_id = project.get("client_id")
        if update_fields.get("client_id") and update_fields["client_id"] != project_client_id:
            raise HTTPException(status_code=400, detail="Project does not belong to selected client")
        update_fields["client_id"] = project_client_id

    if "work_date" in update_fields and update_fields["work_date"]:
        validate_work_date(update_fields["work_date"])
        update_fields["month"] = update_fields["work_date"][:7]

    if (
        user.role == "member"
        and update_fields.get("status") == "Ready for Review"
    ):
        reviewer_id = update_fields.get(
            "reviewer_id",
            existing.get("reviewer_id")
        )

        if not reviewer_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Please assign a reviewer before "
                    "marking this as Ready for Review."
                ),
            )

    if "stage" in update_fields and update_fields["stage"] and update_fields["stage"] not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")

    apply_deliverable_rules(existing, update_fields)
    await apply_time_rules(user, existing, update_fields)

    validate_work_category_rules({**existing, **update_fields})
    return update_fields


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
    """Admins and members see every pending approval, read-only. Managers see
    the queue they can actually act on (see _approval_item_can_act)."""
    return user.role in ("admin", "member")


async def require_manager_or_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role not in {"admin", "manager"}:
        raise HTTPException(
            status_code=403,
            detail="Manager or admin access required"
        )
    return user


DEPARTMENT_TO_STAGE = {
    "Content": "Content",
    "Design": "Design",
    "Animation": "Animate",
}


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


def _push_link(notification: dict, is_admin: bool) -> str:
    """Where clicking the push should take this recipient."""
    action_type = notification.get("action_type")
    if action_type == "open_approvals":
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
                        "link": _push_link(n, is_admin=user_id in admin_ids),
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
async def _production_users_for_stages(stages: List[str]) -> list[dict]:
    departments = [
        department
        for department, stage in DEPARTMENT_TO_STAGE.items()
        if stage in stages
    ]

    if not departments:
        return []

    return await db.users.find(
        {
            "active": {"$ne": False},
            "department": {"$in": departments},
        },
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


async def _admin_users() -> list[dict]:
    """Recipients for notifications that only an admin can act on: creating
    deliverables and editing project status/timeline both require the admin
    role, so notifying production staff about them left those recipients
    with nothing they could actually do."""
    return await db.users.find(
        {"active": {"$ne": False}, "role": "admin"},
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


async def _upsert_notifications_batch(notifications: list[dict]):
    """Write many notifications in a single round trip instead of one
    update_one() per notification. Each op is an independent upsert keyed
    on (user_id, dedupe_key), so ordered=False lets the rest of the batch
    succeed even if one entry races with a concurrent insert."""
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
    production_users = await _production_users_for_stages(list(all_stages))

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
            "stage_status": {"$ne": "Completed"},
            "$or": [{"stage_schedule": {"$exists": False}}, {"stage_schedule": {}}],
        },
        {"_id": 0},
    ).to_list(5000)

    scheduled_candidates = await db.deliverables.find(
        {
            "stage_status": {"$ne": "Completed"},
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

    await _upsert_notifications_batch(pending_notifications)


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
        {"active": {"$ne": False}, "role": {"$ne": "admin"}},
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
        elif approval_type == "COMPLIANCE":
            recipients = [u["id"] for u in users if u.get("department") == "Administration"]
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


@api_router.post("/auth/login", response_model=LoginResponse)
async def login(payload: LoginPayload, response: Response):
    login = payload.login.strip().lower()
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
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if not doc.get("active", True):
        raise HTTPException(status_code=403, detail="Account deactivated")
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


@api_router.get("/work-items/pending-count")
async def work_items_pending_count(request: Request):
    """Lightweight count for the sidebar's Work Sheet badge: items not yet
    Closed. Scoped to the user's own production stage the same way the
    worksheet already scopes what a member/manager can add rows for
    (DEPARTMENT_TO_STAGE) — admins, who have sheet-wide view-only access,
    see the total across every stage."""
    user = await get_acting_user(request)

    query = {"status": {"$ne": "Closed"}}

    if user.role != "admin":
        stage = DEPARTMENT_TO_STAGE.get(user.department)
        if stage:
            query["stage"] = stage

    count = await db.work_items.count_documents(query)
    return {"count": count}


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
        query["deliverable_id"] = {"$in": deliverable_id}

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

    # Existing search. Escaped so typing "(" or "[" in the search box (or the
    # command palette, which reuses this) matches literally instead of
    # producing an invalid regular expression and a 500.
    if search:
        search_pattern = re.escape(search)
        query["$or"] = [
            {
                "deliverable_name": {
                    "$regex": search_pattern,
                    "$options": "i",
                }
            },
            {
                "remarks": {
                    "$regex": search_pattern,
                    "$options": "i",
                }
            },
        ]

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

    data["deliverable_not_available"] = bool(data.get("deliverable_not_available"))
    apply_deliverable_rules({}, data)
    await apply_time_rules(user, {}, data, creator_id=data.get("creator_id"))

    validate_work_category_rules({**data, "work_date": work_date})

    ts = now_iso()
    item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
    await db.work_items.insert_one(item.model_dump())

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

    if user.role != "manager":
        raise HTTPException(
            status_code=403,
            detail="Only manager can review work items",
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

    if (
        user.role == "manager"
        and existing.get("reviewer_id") != user.id
    ):
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

    # Update work item status
    await db.work_items.update_one(
        {"id": item_id},
        {
            "$set": {
                "status": new_status,
                "updated_at": now_iso(),
            }
        },
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

    work_date = tpl.pop("work_date", None) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    validate_work_date(work_date)
    month = work_date[:7]
    await apply_time_rules(user, {}, tpl, creator_id=user.id)
    docs = []
    for _ in range(payload.count):
        data = dict(tpl)
        if user.role == "member":
            data["creator_id"] = user.id
            data["reviewer_id"] = None
            data["manager_id"] = None
        else:
            # A manager's "Add N Rows" provisions blank rows FOR the team,
            # not for the manager personally - leaving creator_id empty
            # (rather than defaulting to the manager's own id) is what keeps
            # these rows open to the whole department under the
            # any-named-creator-locks-the-row rule in scoped_update_fields.
            # An explicitly supplied creator_id (assigning the batch to a
            # specific person) is still honored.
            data["creator_id"] = data.get("creator_id") or None
        ts = now_iso()
        item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
        docs.append(item.model_dump())
    if docs:
        await db.work_items.insert_many(docs)
    return docs


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

    operations = []
    activity_logs = []

    for item_id in payload.ids:
        existing = existing_by_id.get(item_id)

        # Keep the same tolerant behavior as the existing bulk endpoint:
        # skip missing / unauthorized rows rather than failing the whole operation.
        if not existing:
            continue

        creator_department = await get_user_department(
            existing.get("creator_id")
        )
        creator_role = await get_user_role(existing.get("creator_id"))

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
            if it.get("status") == "Closed":
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
    users = await db.users.find({"role": {"$ne": "admin"}}, {"_id": 0}).to_list(1000)
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
@api_router.get("/clients", response_model=List[Client])
async def list_clients(request: Request):
    await get_acting_user(request)
    return await db.clients.find({}, {"_id": 0}).sort("name", 1).to_list(1000)


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
        .limit(1000)
        .batch_size(1000)
        .to_list(1000),
        db.projects.find(visible_projects, {"_id": 0, "id": 1, "name": 1, "client_id": 1})
        .sort("created_at", -1)
        .limit(1000)
        .batch_size(1000)
        .to_list(1000),
        db.deliverables.find({}, {"_id": 0, "id": 1, "name": 1, "project_id": 1})
        .sort("created_at", 1)
        .limit(5000)
        .batch_size(5000)
        .to_list(5000),
    )

    return {
        "clients": clients,
        "projects": projects,
        "deliverables": deliverables,
    }


@api_router.post("/clients", response_model=Client)
async def create_client(payload: ClientCreate, request: Request):
    await require_admin(request)
    c = Client(**payload.model_dump())
    await db.clients.insert_one(c.model_dump())
    return c


class ClientUpdate(BaseModel):
    name: Optional[str] = None
    # Legacy field - kept temporarily for backward compatibility
    contact_person: Optional[str] = None
    # New multiple-contact structure
    contact_persons: Optional[List[dict]] = None
    status: Optional[str] = None


@api_router.patch("/clients/{client_id}", response_model=Client)
async def update_client(client_id: str, payload: ClientUpdate, request: Request):
    await require_admin(request)
    existing = await db.clients.find_one({"id": client_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Client not found")
    update_fields = payload.model_dump(exclude_unset=True)
    if "status" in update_fields and update_fields["status"] not in CLIENT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid client status")
    await db.clients.update_one({"id": client_id}, {"$set": update_fields})
    return Client(**{**existing, **update_fields})


@api_router.delete("/clients/{client_id}")
async def delete_client(
    client_id: str,
    request: Request
):
    user = await require_admin(request)

    client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0}
    )

    if not client:
        raise HTTPException(
            status_code=404,
            detail="Client not found"
        )

    # Do not allow deletion while the client has active projects.
    active_projects = await db.projects.find(
        {
            "client_id": client_id,
            "status": {"$ne": "Completed"},
        },
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "code": 1,
            "status": 1,
        },
    ).to_list(100)

    if active_projects:
        raise HTTPException(
            status_code=400,
            detail="This client has active projects. Complete them before deleting the client."
        )

    # Preserve completed projects and ALL historical work entries.
    # Only detach completed projects from this client.
    await db.projects.update_many(
        {"client_id": client_id},
        {
            "$set": {
                "client_id": None,
                "poc_id": None,
            }
        },
    )

    await db.clients.delete_one(
        {"id": client_id}
    )

    await log_activity(
        collection_name="project_activity_log",
        entity_id=client_id,
        entity_field="client_id",
        action="CLIENT_DELETED",
        changed_by=user.id,
        old_value={
            "name": client.get("name"),
            "status": client.get("status"),
            "contact_persons": client.get("contact_persons") or [],
        },
    )

    return {"success": True}


_PHONE_ALLOWED_RE = re.compile(r"^\+?[0-9\s\-()]+$")


def validate_contact_phone(phone: Optional[str]) -> str:
    """Return the trimmed phone number, or raise 400 if it is not a plausible
    one: digits with an optional leading +, spaces/dashes/brackets allowed,
    7-15 digits in all. Empty is fine - phone is optional."""
    text = (phone or "").strip()
    if not text:
        return ""
    digits = re.sub(r"\D", "", text)
    if not _PHONE_ALLOWED_RE.match(text) or not 7 <= len(digits) <= 15:
        raise HTTPException(
            status_code=400,
            detail="Enter a valid phone number (7-15 digits; only numbers, +, spaces, - and brackets)",
        )
    return text


class ContactPersonCreate(BaseModel):
    name: str
    email: Optional[str] = ""
    phone: Optional[str] = ""
    designation: Optional[str] = ""


class ContactPersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    designation: Optional[str] = None


@api_router.post("/clients/{client_id}/contacts")
async def create_contact_person(
    client_id: str,
    payload: ContactPersonCreate,
    request: Request
):
    await require_admin(request)

    client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0}
    )

    if not client:
        raise HTTPException(
            status_code=404,
            detail="Client not found"
        )

    if not payload.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Contact name is required"
        )

    contact = {
        "id": f"contact-{uuid.uuid4().hex[:8]}",
        "name": payload.name.strip(),
        "email": (payload.email or "").strip(),
        "phone": validate_contact_phone(payload.phone),
        "designation": (payload.designation or "").strip(),
    }

    existing_contacts = client.get("contact_persons") or []

    await db.clients.update_one(
        {"id": client_id},
        {
            "$push": {
                "contact_persons": contact
            }
        }
    )

    return contact


@api_router.patch("/clients/{client_id}/contacts/{contact_id}")
async def update_contact_person(
    client_id: str,
    contact_id: str,
    payload: ContactPersonUpdate,
    request: Request
):
    await require_admin(request)

    client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0}
    )

    if not client:
        raise HTTPException(
            status_code=404,
            detail="Client not found"
        )

    contacts = client.get("contact_persons") or []

    contact = next(
        (c for c in contacts if c.get("id") == contact_id),
        None
    )

    if not contact:
        raise HTTPException(
            status_code=404,
            detail="Contact person not found"
        )

    update_fields = payload.model_dump(exclude_unset=True)

    if "name" in update_fields:
        if not update_fields["name"].strip():
            raise HTTPException(
                status_code=400,
                detail="Contact name is required"
            )
        update_fields["name"] = update_fields["name"].strip()

    for field in ["email", "phone", "designation"]:
        if field in update_fields and update_fields[field] is not None:
            update_fields[field] = update_fields[field].strip()

    if update_fields.get("phone"):
        update_fields["phone"] = validate_contact_phone(update_fields["phone"])

    for field, value in update_fields.items():
        await db.clients.update_one(
            {
                "id": client_id,
                "contact_persons.id": contact_id
            },
            {
                "$set": {
                    f"contact_persons.$.{field}": value
                }
            }
        )

    updated_client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0}
    )

    updated_contact = next(
        c for c in updated_client.get("contact_persons", [])
        if c.get("id") == contact_id
    )

    return updated_contact


@api_router.delete("/clients/{client_id}/contacts/{contact_id}")
async def delete_contact_person(
    client_id: str,
    contact_id: str,
    request: Request
):
    await require_admin(request)

    client = await db.clients.find_one(
        {"id": client_id},
        {"_id": 0}
    )

    if not client:
        raise HTTPException(
            status_code=404,
            detail="Client not found"
        )

    contacts = client.get("contact_persons") or []

    if not any(c.get("id") == contact_id for c in contacts):
        raise HTTPException(
            status_code=404,
            detail="Contact person not found"
        )

    # Don't allow deletion if a project is currently using this POC.
    project_using_contact = await db.projects.find_one(
        {"poc_id": contact_id},
        {"_id": 0}
    )

    if project_using_contact:
        raise HTTPException(
            status_code=400,
            detail="This contact is assigned to a project. Reassign the project before deleting the contact."
        )

    await db.clients.update_one(
        {"id": client_id},
        {
            "$pull": {
                "contact_persons": {
                    "id": contact_id
                }
            }
        }
    )

    return {"message": "Contact person deleted"}


# ---------------- Notifications routes ----------------
@api_router.get("/notifications")
async def list_notifications(request: Request, limit: int = 50):
    user = await get_acting_user(request)
    try:
        await _ensure_overdue_notifications()
    except Exception:
        # Creating overdue notices is best-effort; the user's own list must
        # still load even if that scan trips over bad data.
        logger.exception("Overdue notification scan failed")
    await _ensure_reminder_notifications()

    limit = max(1, min(limit, 100))
    return await db.notifications.find(
        {"user_id": user.id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)


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

    if include_deliverables:
        # Fetch all deliverables for all projects in ONE query
        deliverables = await db.deliverables.find(
            {"project_id": {"$in": project_ids}},
            {"_id": 0},
        ).to_list(5000)
    else:
        # List pages only need the counts (in total and per stage), not the
        # full nested documents - which for a few hundred projects is
        # thousands of deliverables and over a megabyte of JSON. The database
        # does the counting and only the totals cross the wire.
        count_rows = await db.deliverables.aggregate([
            {"$match": {"project_id": {"$in": project_ids}}},
            {"$group": {
                "_id": {
                    "project_id": "$project_id",
                    "stage": {"$ifNull": ["$current_stage", "Content"]},
                },
                "count": {"$sum": 1},
            }},
        ]).to_list(None)
        for row in count_rows:
            key = row.get("_id") or {}
            pid = key.get("project_id")
            if not pid:
                continue
            count = row.get("count", 0)
            deliverable_counts[pid] = deliverable_counts.get(pid, 0) + count
            per_stage = stage_counts_by_project.setdefault(pid, {})
            per_stage[key.get("stage")] = per_stage.get(key.get("stage"), 0) + count

    # Fetch all clients in ONE query
    clients = await db.clients.find(
        {"id": {"$in": client_ids}},
        {"_id": 0},
    ).to_list(1000)

    # Attach approval configuration without storing it on the deliverable document.
    if deliverables:
        approval_rows = await db.approval_workflows.find(
            {"deliverable_id": {"$in": [d["id"] for d in deliverables]}},
            {"_id": 0, "deliverable_id": 1, "required_types": 1},
        ).to_list(5000)
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

        if client_doc:
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
    limit: int = 1000,
    include_deliverables: bool = True,
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
        search_pattern = re.escape(search)
        and_clauses.append({
            "$or": [
                {"name": {"$regex": search_pattern, "$options": "i"}},
                {"code": {"$regex": search_pattern, "$options": "i"}},
            ]
        })

    if and_clauses:
        query["$and"] = and_clauses

    limit = max(1, min(limit, 1000))

    projects = await db.projects.find(
        query,
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)

    return await _hydrate_projects(
        projects,
        include_deliverables=include_deliverables,
    )


@api_router.get("/projects/metrics")
async def project_metrics(request: Request):
    await get_acting_user(request)
    # Only two fields per project are needed, and the deliverable total is
    # just a count - this used to download every project and every
    # deliverable document (capped at 5000) only to take len() of the list.
    projects = await db.projects.find(
        {}, {"_id": 0, "status": 1, "end_date": 1}
    ).to_list(1000)
    total_deliverables = await db.deliverables.count_documents({})
    today = datetime.now(timezone.utc).date()
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


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    # Project detail is read-only for everyone; every write endpoint below
    # (create / update / hide / delete / import) stays admin-only.
    await get_acting_user(request)
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _hydrate_project(p)


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
        poc_id=payload.poc_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
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

    await db.projects.insert_one(project.model_dump())

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


@api_router.post("/projects/bulk-delete")
async def bulk_delete_projects(payload: BulkProjectIdsPayload, request: Request):
    user = await require_admin(request)

    project_ids = payload.project_ids

    if not project_ids:
        raise HTTPException(
            status_code=400,
            detail="No projects selected"
        )

    # Preserve historical work entries.
    await db.work_items.update_many(
        {"project_id": {"$in": project_ids}},
        {
            "$set": {
                "project_id": None,
                "deliverable_id": None,
            }
        },
    )

    deliverable_ids = [
        d["id"]
        for d in await db.deliverables.find(
            {"project_id": {"$in": project_ids}}, {"_id": 0, "id": 1}
        ).to_list(20000)
    ]

    await db.projects.delete_many({"id": {"$in": project_ids}})
    await db.deliverables.delete_many({"project_id": {"$in": project_ids}})
    await _delete_approvals_for_deliverables(deliverable_ids)

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

    # Preserve historical work entries.
    # Remove their references to this project/deliverables,
    # but NEVER delete the work entries themselves.
    await db.work_items.update_many(
        {"project_id": project_id},
        {
            "$set": {
                "project_id": None,
                "deliverable_id": None,
            }
        },
    )

    deliverable_ids = [
        d["id"]
        for d in await db.deliverables.find(
            {"project_id": project_id}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]

    await db.projects.delete_one({"id": project_id})
    await db.deliverables.delete_many({"project_id": project_id})
    await _delete_approvals_for_deliverables(deliverable_ids)

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
    deliverables = await db.deliverables.find(query, {"_id": 0}).sort("created_at", 1).to_list(5000)
    ids = [d["id"] for d in deliverables]
    workflows = await db.approval_workflows.find({"deliverable_id": {"$in": ids}}, {"_id": 0, "deliverable_id": 1, "required_types": 1}).to_list(5000) if ids else []
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
        existing_docs = await db.deliverables.find(
            {"project_id": project_id}, {"_id": 0, "name": 1, "type": 1}
        ).to_list(5000)
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
    await _persist_deliverable_batch(deliverable_docs, workflow_docs, item_docs, activity_docs)

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


async def _approval_item_can_act(user: User, item: dict, deliverable: dict) -> bool:
    # Only managers act on approvals; admins and members are view-only.
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

    if approval_type == "COMPLIANCE":
        return user.department == "Administration"

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

    query = {"status": "Ready for Review"}

    # Managers only see work explicitly assigned to them; admins see all.
    if user.role == "manager":
        query["reviewer_id"] = user.id

    count = await db.work_items.count_documents(query)
    return {"count": count}


@api_router.get("/bulk-review")
async def list_bulk_review(request: Request):
    """Work items assigned to the logged-in manager and ready for review."""
    user = await get_acting_user(request)

    if user.role not in ("admin", "manager"):
        raise HTTPException(
            status_code=403,
            detail="Only admin or manager can access bulk review"
        )

    query = {
        "status": "Ready for Review"
    }

    # Managers only see work explicitly assigned to them.
    # Admins can see all ready-for-review work.
    if user.role == "manager":
        query["reviewer_id"] = user.id

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

    result = []

    for item in items:
        project = projects.get(item.get("project_id") or "") or {}
        creator = users.get(item.get("creator_id") or "") or {}
        reviewer = users.get(item.get("reviewer_id") or "") or {}
        client = clients.get(project.get("client_id") or "") or {}

        result.append({
            **item,
            "project_name": project.get("name", ""),
            "project_code": project.get("code", ""),
            "client_name": client.get("name", ""),
            "creator_name": creator.get("name", "Unknown"),
            "reviewer_name": reviewer.get("name", "Unassigned"),
        })

    return result


async def _build_implicit_manager_items(user: User):
    """Build manager approvals for ready deliverables without workflows."""

    if user.role not in ("admin", "manager", "member"):
        return []

    # Fetch ready deliverables once.
    ready = await db.deliverables.find(
        {"stage_status": "Ready for Review"},
        {"_id": 0},
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
                "approval_type": "COMPLIANCE",
                "assigned_to": None,
                "department": "Administration",
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
        for item in hydrated:
            item.pop("_deliverable", None)
        return hydrated

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
                    "approval_type": "COMPLIANCE",
                    "assigned_to": None,
                    "department": "Administration",
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

    items = await db.approval_items.find(
        _approval_visibility_query(user, "visible"),
        {"_id": 0},
    ).to_list(500)

    if _approvals_view_all(user):
        count = len(items)
    else:
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
            if deliverable and await _approval_item_can_act(user, item, deliverable):
                count += 1

    # Implicit manager approvals (ready deliverables with no workflow yet)
    # aren't real documents, so they can't be counted with the query above -
    # _build_implicit_manager_items already scopes them to the user (and to
    # the manager's own stage) in batched queries, same as the board.
    count += len(await _build_implicit_manager_items(user))

    return {"count": count}


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
            allowed = True
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
    """Tell the next stage's team that a deliverable has just reached them.

    Managers of that department get an "open Approvals" notice (the approval
    card is already waiting on their board); the department's members get an
    "open Work Sheet" notice. One notice per user per hand-off - the key
    includes the hand-off timestamp so a deliverable that is sent back and
    approved again notifies the team again.
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
            "role": {"$in": ["manager", "member"]},
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
        is_manager = recipient.get("role") == "manager"
        notifications.append({
            "id": str(uuid.uuid4()),
            "user_id": recipient["id"],
            "type": "stage_handoff",
            "title": f"{stage} approval ready" if is_manager else f"Ready for {stage}",
            "message": (
                f"{label} has moved to {stage} and is waiting in Approvals.{due_note}"
                if is_manager
                else f"{label} has moved to {stage}. You can start your work.{due_note}"
            ),
            "project_id": deliverable.get("project_id"),
            "deliverable_id": deliverable.get("id"),
            "client_id": project.get("client_id"),
            "stage": stage,
            "action_type": "open_approvals" if is_manager else "open_worksheet",
            "created_at": ts,
            "read_at": None,
            "actioned_at": None,
            "dedupe_key": f'stage-handoff:{deliverable.get("id")}:{stage}:{ts}:{recipient["id"]}',
        })

    await _upsert_notifications_batch(notifications)


async def advance_deliverable_stage(
    deliverable: dict,
    reviewer_id: str,
    note: str,
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
        # A notification problem must never fail the approval itself.
        try:
            await _notify_stage_handoff(updated, next_stage, ts)
        except Exception:
            logger.exception("Could not send stage hand-off notifications")

    return updated


@api_router.post("/approval-items/{approval_item_id}/approve")
async def approve_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
    user = await require_manager(request)
    item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
    if not item and approval_item_id.startswith("implicit-manager-"):
        deliverable_id = approval_item_id.removeprefix("implicit-manager-")
        item = {"id": approval_item_id, "deliverable_id": deliverable_id, "approval_type": "MANAGER", "status": "PENDING", "assigned_to": None, "department": user.department}
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    d = await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    if item.get("status") != "PENDING":
        raise HTTPException(status_code=400, detail="This approval is not pending")
    if not await _approval_item_can_act(user, item, d):
        raise HTTPException(status_code=403, detail="You are not authorized to approve this item")
    ts = now_iso()
    if item.get("approval_workflow_id") is None:
        await advance_deliverable_stage(d, user.id, payload.note or "")
        await db.approval_history.insert_one({"id": str(uuid.uuid4()), "approval_item_id": approval_item_id, "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id, "comment": payload.note or "", "created_at": ts})
        return await get_deliverable_approvals(d["id"], request)
    await db.approval_items.update_one(
        {"id": approval_item_id},
        {"$set": {"status": "APPROVED", "approved_by": user.id, "approved_at": ts, "comments": payload.note or "", "updated_at": ts}},
    )
    workflow = await _get_approval_workflow(d["id"])
    pending = await db.approval_items.count_documents({"approval_workflow_id": workflow["id"], "status": "PENDING"})
    if pending == 0:
        await advance_deliverable_stage(d, user.id, payload.note or "")
    await db.approval_history.insert_one({
        "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
        "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id,
        "comment": payload.note or "", "created_at": ts,
    })
    return await get_deliverable_approvals(d["id"], request)


@api_router.post("/approval-items/{approval_item_id}/send-back")
async def send_back_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
    user = await require_manager(request)
    item = await db.approval_items.find_one({"id": approval_item_id}, {"_id": 0})
    if not item and approval_item_id.startswith("implicit-manager-"):
        deliverable_id = approval_item_id.removeprefix("implicit-manager-")
        item = {"id": approval_item_id, "deliverable_id": deliverable_id, "approval_type": "MANAGER", "status": "PENDING", "assigned_to": None, "department": user.department}
    if not item:
        raise HTTPException(status_code=404, detail="Approval item not found")
    d = await db.deliverables.find_one({"id": item["deliverable_id"]}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    if item.get("status") != "PENDING":
        raise HTTPException(status_code=400, detail="This approval is not pending")
    if not await _approval_item_can_act(user, item, d):
        raise HTTPException(status_code=403, detail="You are not authorized to send this item back")
    ts = now_iso()
    if item.get("approval_workflow_id") is None:
        await db.deliverables.update_one({"id": d["id"]}, {"$set": {"stage_status": "Changes Requested", "updated_at": ts, "last_review_action": "rejected", "last_reviewer_id": user.id, "last_review_note": payload.note or ""}})
        await db.approval_history.insert_one({"id": str(uuid.uuid4()), "approval_item_id": approval_item_id, "deliverable_id": d["id"], "action": "CHANGES_REQUESTED", "performed_by": user.id, "comment": payload.note or "", "created_at": ts})
        return await get_deliverable_approvals(d["id"], request)
    await db.approval_items.update_one(
        {"id": approval_item_id},
        {"$set": {"status": "CHANGES_REQUESTED", "sent_back_by": user.id, "sent_back_at": ts, "comments": payload.note or "", "updated_at": ts}},
    )
    workflow = await _get_approval_workflow(d["id"])
    await db.approval_workflows.update_one(
        {"id": workflow["id"]},
        {"$set": {"status": "CHANGES_REQUESTED", "updated_at": ts}},
    )
    await db.deliverables.update_one(
        {"id": d["id"]},
        {"$set": {"stage_status": "Changes Requested", "updated_at": ts}},
    )
    await db.approval_history.insert_one({
        "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
        "deliverable_id": d["id"], "action": "CHANGES_REQUESTED", "performed_by": user.id,
        "comment": payload.note or "", "created_at": ts,
    })
    return await get_deliverable_approvals(d["id"], request)


@api_router.patch("/approval-items/{approval_item_id}/move")
async def move_approval_item(approval_item_id: str, payload: ApprovalMove, request: Request):
    user = await require_manager(request)
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
    user = await require_manager(request)

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
    user = await require_manager(request)

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
    user = await require_manager(request)

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
    user = await require_manager(request)

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
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Only managers can approve")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    # Use the deliverable's own selected pipeline, not the fixed global
    # stage order, so this stays consistent with the Approvals Kanban.
    return await advance_deliverable_stage(existing, user.id, payload.note or "")


@api_router.post("/deliverables/{deliverable_id}/reject")
async def reject_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
    if user.role != "manager":
        raise HTTPException(status_code=403, detail="Only managers can reject")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    update = {"stage_status": "Changes Requested", "updated_at": now_iso(), "last_review_note": payload.note or "", "last_review_action": "rejected", "last_reviewer_id": user.id}
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update})
    return await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})


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

app.include_router(api_router)

@app.middleware("http")
async def server_timing_middleware(request: Request, call_next):
    """Time every request inside the app (handler + response validation, not
    network). Shown in Chrome DevTools > Network > Timing > "Server Timing", and
    anything slower than 800ms is written to the server log, so slow endpoints
    can be told apart from a slow network."""
    started = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    response.headers["Server-Timing"] = f"app;dur={elapsed_ms:.0f}"
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

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


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
            {"role": {"$ne": "admin"}}, {"_id": 0, "id": 1}
        ).to_list(5000)
    ]
    if not non_admin_ids:
        return

    await db.notifications.delete_many({
        "user_id": {"$in": non_admin_ids},
        "deliverable_id": None,
        "type": {"$in": ["delayed_deadline", "new_project"]},
    })


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
    await migrate_orphan_approvals()
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
    await db.clients.create_index("id")
    await db.projects.create_index("id")
    await db.projects.create_index("code")
    await db.deliverables.create_index("id")
    await db.projects.create_index([("status", 1), ("kanban_order", 1)])
    # Speeds up the overdue-deadline scan in _ensure_overdue_notifications,
    # which range-queries on these date fields every ~60s.
    await db.projects.create_index([("end_date", 1)])
    await db.deliverables.create_index([("end_dt", 1)])
    await db.deliverables.create_index([("project_id", 1)])
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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()