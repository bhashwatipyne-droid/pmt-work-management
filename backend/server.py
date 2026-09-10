from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
import asyncio
import os
import certifi
import logging
import string
import random
import bcrypt
import jwt
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(
    mongo_url,
    tlsCAFile=certifi.where()
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

STATUSES = ["Not Started", "Ongoing", "Ready for Review", "Changes Requested", "Rework", "Closed"]
MEMBER_FORWARD_STATUSES = ["Not Started", "Ongoing", "Ready for Review"]
MEMBER_EDITABLE_FIELDS = {"work_date", "version", "time_taken_minutes", "remarks", "status", "client_id", "project_id", "deliverable_id", "stage", "deliverable_name", "deliverable_type", "deliverable_link", "reviewer_id", "work_category"}

PROJECT_STATUSES = ["Planning", "Active", "In Rework", "Completed"]
STAGES = ["Content", "Design", "Animate", "Finish"]
STAGE_STATUSES = ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"]
CLIENT_STATUSES = ["Active", "Inactive"]
DEPARTMENTS = ["Content", "Design", "Animation", "Finish", "Administration"]
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
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
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
    creator_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    manager_id: Optional[str] = None
    client_id: Optional[str] = None
    project_id: Optional[str] = None
    deliverable_id: Optional[str] = None
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
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    approval_types: Optional[List[str]] = None


class ProjectCreate(BaseModel):
    name: str
    client_id: str
    # Selected contact person for this project
    poc_id: Optional[str] = None
    start_date: str
    end_date: str
    status: Optional[str] = "Planning"
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
    status: str = "Planning"
    created_at: str
    updated_at: str


class Deliverable(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    name: str
    type: str = ""
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
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
    doc = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    if not doc.get("active", True):
        raise HTTPException(status_code=401, detail="Account deactivated")
    return User(**doc)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


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
    activity = {
        "id": str(uuid.uuid4()),
        entity_field: entity_id,
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "changed_by": changed_by,
        "changed_at": now_iso(),
        "metadata": metadata or {},
    }

    await db[collection_name].insert_one(activity)


def gen_project_code() -> str:
    return "proj" + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))


async def scoped_update_fields(user: User, existing: dict, update_fields: dict, creator_department: Optional[str] = None) -> dict:
    """Apply role-based restrictions to a raw update payload. Raises HTTPException on violation."""
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    if user.role == "member":
        # Members share rows within their department/stage. Creator ownership is
        # not used as an edit lock; Add 5 Rows creates shared team rows.
        department_stage = {
            "Content": "Content",
            "Design": "Design",
            "Animation": "Animate",
            "Finish": "Finish",
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
        update_fields["month"] = update_fields["work_date"][:7]
    if "stage" in update_fields and update_fields["stage"] and update_fields["stage"] not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    return update_fields


async def require_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


async def require_manager_or_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role not in {"admin", "manager"}:
        raise HTTPException(
            status_code=403,
            detail="Manager or admin access required"
        )
    return user


async def get_user_department(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "department": 1})
    return doc.get("department") if doc else None


# ---------------- Routes ----------------
@api_router.get("/")
async def root():
    return {"message": "Work Sheet API"}


class LoginPayload(BaseModel):
    login: str
    password: str


@api_router.post("/auth/login", response_model=User)
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
    return User(**doc)


@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logged out"}


@api_router.get("/auth/me", response_model=User)
async def me(request: Request):
    return await get_acting_user(request)


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


@api_router.get("/work-items", response_model=List[WorkItem])
async def list_work_items(
    request: Request,
    status: Optional[List[str]] = None,
    stage: Optional[List[str]] = None,
    deliverable_type: Optional[List[str]] = None,
    work_category: Optional[List[str]] = None,
    month: Optional[str] = None,
    search: Optional[str] = None,

    creator_id: Optional[List[str]] = None,
    reviewer_id: Optional[List[str]] = None,
    project_id: Optional[List[str]] = None,
    deliverable_id: Optional[List[str]] = None,

    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
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

    # Existing search
    if search:
        query["$or"] = [
            {
                "deliverable_name": {
                    "$regex": search,
                    "$options": "i",
                }
            },
            {
                "remarks": {
                    "$regex": search,
                    "$options": "i",
                }
            },
        ]

    items = (
        await db.work_items
        .find(query, {"_id": 0})
        .sort([("work_date", -1), ("created_at", -1)])
        .to_list(5000)
    )

    return items


@api_router.post("/work-items", response_model=WorkItem)
async def create_work_item(payload: WorkItemCreate, request: Request):
    user = await get_acting_user(request)
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    data = payload.model_dump()
    work_date = data.pop("work_date", None) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
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

    ts = now_iso()
    item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
    await db.work_items.insert_one(item.model_dump())
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

    update_fields = await scoped_update_fields(
        user,
        existing,
        payload.model_dump(exclude_unset=True),
        creator_department,
    )

    # Keep the old values before updating MongoDB
    old_status = existing.get("status")
    old_stage = existing.get("stage")

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

    return updated


@api_router.post("/work-items/bulk-create", response_model=List[WorkItem])
async def bulk_create_work_items(payload: BulkCreatePayload, request: Request):
    user = await get_acting_user(request)
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    if payload.count < 1 or payload.count > 500:
        raise HTTPException(status_code=400, detail="count must be between 1 and 500")
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
    month = work_date[:7]
    docs = []
    for _ in range(payload.count):
        data = dict(tpl)
        if user.role == "member":
            data["creator_id"] = user.id
            data["reviewer_id"] = None
            data["manager_id"] = None
        else:
            data["creator_id"] = data.get("creator_id") or user.id
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

        try:
            update_fields = await scoped_update_fields(
                user,
                existing,
                dict(raw_fields),
                creator_department,
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
async def bulk_delete_work_items(payload: BulkDeletePayload, request: Request):
    await require_admin(request)
    result = await db.work_items.delete_many({"id": {"$in": payload.ids}})
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
        total_minutes += it.get("time_taken_minutes", 0) or 0
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
            total_minutes += it.get("time_taken_minutes", 0) or 0
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
        "phone": (payload.phone or "").strip(),
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


# ---------------- Projects ----------------
def _project_code_exists_query(code: str) -> dict:
    return {"code": code}


async def _generate_unique_project_code() -> str:
    for _ in range(10):
        code = gen_project_code()
        if not await db.projects.find_one(_project_code_exists_query(code), {"_id": 0}):
            return code
    return gen_project_code()


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
    client_ids = [p["client_id"] for p in projects if p.get("client_id")]

    deliverables = []
    deliverable_counts = {}

    if include_deliverables:
        # Fetch all deliverables for all projects in ONE query
        deliverables = await db.deliverables.find(
            {"project_id": {"$in": project_ids}},
            {"_id": 0},
        ).to_list(5000)
    else:
        # Dashboard only needs the count, not the full nested documents.
        count_rows = await db.deliverables.aggregate([
            {"$match": {"project_id": {"$in": project_ids}}},
            {"$group": {"_id": "$project_id", "count": {"$sum": 1}}},
        ]).to_list(None)
        deliverable_counts = {
            row.get("_id"): row.get("count", 0)
            for row in count_rows
            if row.get("_id")
        }

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

        for d in project_deliverables:
            stage = d.get("current_stage", "Content")

            stage_counts[stage] = stage_counts.get(stage, 0) + 1

            if d.get("owner_id"):
                collaborators.add(d["owner_id"])

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
    limit: int = 1000,
    include_deliverables: bool = True,
):
    await get_acting_user(request)

    query = {}

    if status:
        query["status"] = status

    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"code": {"$regex": search, "$options": "i"}},
        ]

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
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    deliverables = await db.deliverables.find({}, {"_id": 0}).to_list(5000)
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
        "total_deliverables": len(deliverables),
    }


@api_router.get("/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    await get_acting_user(request)
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return await _hydrate_project(p)


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
        status=payload.status or "Planning",
        created_at=ts,
        updated_at=ts,
    )
    await db.projects.insert_one(project.model_dump())
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
    for d in payload.deliverables or []:
        approval_types = d.approval_types or []
        deliv = Deliverable(
            project_id=project.id,
            name=d.name,
            type=d.type or "",
            owner_id=d.owner_id,
            start_dt=d.start_dt,
            end_dt=d.end_dt,
            current_stage="Content",
            stage_status="Not Started",
            approval_types=approval_types,
            created_at=ts,
            updated_at=ts,
        )
        db_doc = deliv.model_dump()
        db_doc.pop("approval_types", None)
        await db.deliverables.insert_one(db_doc)
        if approval_types:
            await _create_or_sync_approval_workflow({**db_doc, "approval_types": approval_types}, approval_types, user.id)
        await log_activity(
            collection_name="deliverable_activity_log",
            entity_id=deliv.id,
            entity_field="deliverable_id",
            action="DELIVERABLE_CREATED",
            changed_by=user.id,
            new_value={
                "name": deliv.name,
                "type": deliv.type,
                "project_id": deliv.project_id,
                "owner_id": deliv.owner_id,
                "current_stage": deliv.current_stage,
                "stage_status": deliv.stage_status,
            },
        )
    p = await db.projects.find_one({"id": project.id}, {"_id": 0})
    return await _hydrate_project(p)


@api_router.patch("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, request: Request):
    user = await require_admin(request)
    existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    update_fields = payload.model_dump(exclude_unset=True)

    if "status" in update_fields and update_fields["status"] not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")

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


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    user = await require_manager_or_admin(request)

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

    await db.projects.delete_one({"id": project_id})
    await db.deliverables.delete_many({"project_id": project_id})

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
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    current_stage: Optional[str] = "Content"
    stage_status: Optional[str] = "Not Started"
    approval_types: Optional[List[str]] = None


class DeliverableUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    current_stage: Optional[str] = None
    stage_status: Optional[str] = None
    approval_types: Optional[List[str]] = None


class ApprovalWorkflowCreate(BaseModel):
    approval_types: List[str] = Field(default_factory=list)


class ApprovalDecision(BaseModel):
    note: Optional[str] = ""


class ApprovalMove(BaseModel):
    approval_type: str


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
    if not await db.projects.find_one({"id": payload.project_id}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Project not found")
    ts = now_iso()
    payload_data = payload.model_dump()
    approval_types = payload_data.pop("approval_types", None) or []
    d = Deliverable(created_at=ts, updated_at=ts, **payload_data, approval_types=approval_types)
    db_doc = d.model_dump()
    db_doc.pop("approval_types", None)
    await db.deliverables.insert_one(db_doc)
    if approval_types:
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
            "owner_id": d.owner_id,
            "current_stage": d.current_stage,
            "stage_status": d.stage_status,
        },
    )
    return d


@api_router.patch("/deliverables/{deliverable_id}", response_model=Deliverable)
async def update_deliverable(deliverable_id: str, payload: DeliverableUpdate, request: Request):
    user = await require_admin(request)
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    update_fields = payload.model_dump(exclude_unset=True)
    approval_types = update_fields.pop("approval_types", None)
    if "current_stage" in update_fields and update_fields["current_stage"] not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    if "stage_status" in update_fields and update_fields["stage_status"] not in STAGE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid stage status")

    old_stage = existing.get("current_stage")
    old_stage_status = existing.get("stage_status")

    update_fields["updated_at"] = now_iso()
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update_fields})

    updated_for_workflow = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if approval_types is not None:
        await _create_or_sync_approval_workflow(updated_for_workflow, approval_types, user.id)
    if update_fields.get("stage_status") == "Ready for Review" and existing.get("stage_status") != "Ready for Review":
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
    user = await require_manager_or_admin(request)

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
    if payload.department and payload.department not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Invalid department")

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
            update_fields["department"]
            and update_fields["department"]
            not in DEPARTMENTS
        ):
            raise HTTPException(
                status_code=400,
                detail="Invalid department"
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

    updated = await db.users.find_one(
        {"id": user_id},
        {"_id": 0}
    )

    return User(**updated)


# ---------------- Approval helpers ----------------
async def _get_approval_workflow(deliverable_id: str):
    return await db.approval_workflows.find_one({"deliverable_id": deliverable_id}, {"_id": 0})


async def _create_or_sync_approval_workflow(deliverable: dict, approval_types: List[str], changed_by: Optional[str] = None):
    normalized = []
    for value in approval_types or []:
        value = str(value).upper().strip()
        if value not in APPROVAL_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid approval type: {value}")
        if value not in normalized:
            normalized.append(value)
    workflow = await _get_approval_workflow(deliverable["id"])
    ts = now_iso()
    if not normalized:
        if workflow:
            await db.approval_items.delete_many({"approval_workflow_id": workflow["id"]})
            await db.approval_workflows.delete_one({"id": workflow["id"]})
        return None
    if not workflow:
        workflow = {"id": str(uuid.uuid4()), "deliverable_id": deliverable["id"], "status": "NOT_STARTED", "required_types": normalized, "created_at": ts, "updated_at": ts}
        await db.approval_workflows.insert_one(workflow)
    else:
        await db.approval_workflows.update_one({"id": workflow["id"]}, {"$set": {"required_types": normalized, "updated_at": ts}})
    existing = await db.approval_items.find({"approval_workflow_id": workflow["id"]}, {"_id": 0}).to_list(50)
    existing_types = {x.get("approval_type") for x in existing}
    for approval_type in normalized:
        if approval_type not in existing_types:
            item = {"id": str(uuid.uuid4()), "approval_workflow_id": workflow["id"], "deliverable_id": deliverable["id"], "approval_type": approval_type, "status": "PENDING" if deliverable.get("stage_status") == "Ready for Review" else "NOT_STARTED", "assigned_to": None, "department": "Administration" if approval_type == "COMPLIANCE" else None, "requested_at": ts if deliverable.get("stage_status") == "Ready for Review" else None, "approved_at": None, "sent_back_at": None, "approved_by": None, "sent_back_by": None, "comments": "", "created_at": ts, "updated_at": ts}
            await db.approval_items.insert_one(item)
    await db.approval_items.delete_many({"approval_workflow_id": workflow["id"], "approval_type": {"$nin": normalized}})
    return await _get_approval_workflow(deliverable["id"])


async def _set_approval_items_pending(deliverable_id: str):
    workflow = await _get_approval_workflow(deliverable_id)
    if not workflow:
        return
    ts = now_iso()
    await db.approval_items.update_many({"approval_workflow_id": workflow["id"]}, {"$set": {"status": "PENDING", "requested_at": ts, "approved_at": None, "sent_back_at": None, "approved_by": None, "sent_back_by": None, "comments": "", "updated_at": ts}})
    await db.approval_workflows.update_one({"id": workflow["id"]}, {"$set": {"status": "IN_PROGRESS", "updated_at": ts, "completed_at": None}})


async def _approval_item_can_act(user: User, item: dict, deliverable: dict) -> bool:
    if user.role == "admin":
        return True

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
            "Finish": "Finish",
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
            [d.get("owner_id") for d in deliverables.values()]
            + [x.get("assigned_to") for x in items]
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
        owner = users.get(d.get("owner_id"), {})
        assigned = users.get(item.get("assigned_to"), {})
        client = clients.get(p.get("client_id"), {})

        result.append({
            **item,
            "_deliverable": d,
            "deliverable_name": d.get("name", ""),
            "deliverable_type": d.get("type", ""),
            "current_stage": d.get("current_stage", "Content"),
            "stage_status": d.get("stage_status", "Not Started"),
            "owner_name": owner.get("name", "Unassigned"),
            "assigned_to_name": assigned.get("name", "Unassigned"),
            "project_name": p.get("name", ""),
            "project_code": p.get("code", ""),
            "client_name": client.get("name", ""),
        })

    return result


# ---------------- Approvals (deliverable review queue) ----------------
def _next_stage(stage: str) -> Optional[str]:
    try:
        idx = STAGES.index(stage)
        return STAGES[idx + 1] if idx + 1 < len(STAGES) else None
    except ValueError:
        return None


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

    if user.role not in ("admin", "manager"):
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
            "Finish": "Finish",
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

    if user.role != "admin":
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

    # Admins can see all approval items.
    # No permission query is required for every item.
    if user.role == "admin":
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


@api_router.get("/approvals/board")
async def approval_board(request: Request):
    """Return pending approval cards grouped by approval authority."""

    user = await get_acting_user(request)

    query = {"status": "PENDING"}

    if user.role != "admin":
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

    # Build implicit manager approvals efficiently.
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

        if user.role == "admin":
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


@api_router.post("/approval-items/{approval_item_id}/approve")
async def approve_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
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
        await db.deliverables.update_one({"id": d["id"]}, {"$set": {"stage_status": "Completed", "updated_at": ts, "last_review_action": "approved", "last_reviewer_id": user.id, "last_review_note": payload.note or ""}})
        await db.approval_history.insert_one({"id": str(uuid.uuid4()), "approval_item_id": approval_item_id, "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id, "comment": payload.note or "", "created_at": ts})
        return await get_deliverable_approvals(d["id"], request)
    await db.approval_items.update_one(
        {"id": approval_item_id},
        {"$set": {"status": "APPROVED", "approved_by": user.id, "approved_at": ts, "comments": payload.note or "", "updated_at": ts}},
    )
    workflow = await _get_approval_workflow(d["id"])
    pending = await db.approval_items.count_documents({"approval_workflow_id": workflow["id"], "status": "PENDING"})
    if pending == 0:
        await db.approval_workflows.update_one(
            {"id": workflow["id"]},
            {"$set": {"status": "COMPLETED", "completed_at": ts, "updated_at": ts}},
        )
        await db.deliverables.update_one(
            {"id": d["id"]},
            {"$set": {"stage_status": "Completed", "updated_at": ts}},
        )
    await db.approval_history.insert_one({
        "id": str(uuid.uuid4()), "approval_item_id": approval_item_id,
        "deliverable_id": d["id"], "action": "APPROVED", "performed_by": user.id,
        "comment": payload.note or "", "created_at": ts,
    })
    return await get_deliverable_approvals(d["id"], request)


@api_router.post("/approval-items/{approval_item_id}/send-back")
async def send_back_approval_item(approval_item_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
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
    user = await require_manager_or_admin(request)
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
    if user.role != "admin" and not await _approval_item_can_act(user, item, d):
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


# Legacy endpoints remain for the existing stage-based Close Stage UI.
@api_router.post("/deliverables/{deliverable_id}/approve")
async def approve_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can approve")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    cur = existing.get("current_stage", "Content")
    nxt = _next_stage(cur)
    update = {"stage_status": "Completed"} if nxt is None else {"current_stage": nxt, "stage_status": "Not Started"}
    update.update({"updated_at": now_iso(), "last_review_note": payload.note or "", "last_review_action": "approved", "last_reviewer_id": user.id})
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update})
    return await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})


@api_router.post("/deliverables/{deliverable_id}/reject")
async def reject_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
    user = await get_acting_user(request)
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can reject")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    update = {"stage_status": "Changes Requested", "updated_at": now_iso(), "last_review_note": payload.note or "", "last_review_action": "rejected", "last_reviewer_id": user.id}
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update})
    return await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})


app.include_router(api_router)

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


@app.on_event("startup")
async def run_startup_migrations():
    await migrate_client_contacts()
    await db.approval_workflows.create_index("deliverable_id", unique=True)
    await db.approval_items.create_index([("approval_workflow_id", 1), ("approval_type", 1)], unique=True)
    await db.approval_items.create_index([("status", 1), ("approval_type", 1), ("assigned_to", 1)])
    await db.approval_items.create_index([("status", 1), ("approval_type", 1)])
    await db.approval_items.create_index([("status", 1), ("assigned_to", 1)])
    await db.approval_items.create_index([("approval_workflow_id", 1)])
    await db.approval_items.create_index([("deliverable_id", 1)])
    await db.approval_history.create_index([("deliverable_id", 1), ("created_at", -1)])


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()