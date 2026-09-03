from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
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
    "Internal Meets & Discussions",
    "Client Meets & Discussions",
    "Other Initiatives",
    "Manager: Team Reviews / Feedback",
    "Freelance: Reviews / Feedback",
    "Campaign Ideation Plan",
    "Campaign Ideation Plan (Quantitative Analysis)",
    "Campaign Ideation Plan (Content Peer Analysis)",
    "Campaign Ideation Plan (Keywords / Key Visual Taglines)",
    "Internal Feedback Implementation",
    "External Feedback Implementation",
    "Internal Review (Design / Animation Team)",
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
]
WORK_CATEGORIES = ["Core", "Non-Core"]
STATUSES = ["Not Started", "Ongoing", "Ready for Review", "Changes Requested", "Closed"]
MEMBER_FORWARD_STATUSES = ["Not Started", "Ongoing", "Ready for Review"]
MEMBER_EDITABLE_FIELDS = {"work_date", "version", "time_taken_minutes", "remarks", "status", "project_id", "deliverable_id", "stage", "deliverable_name", "deliverable_type", "deliverable_link"}

PROJECT_STATUSES = ["Planning", "Active", "In Rework", "Completed"]
STAGES = ["Content", "Design", "Animate", "Finish"]
STAGE_STATUSES = ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"]
CLIENT_STATUSES = ["Active", "Inactive"]
DEPARTMENTS = ["Content", "Design", "Animation", "Finish", "Administration"]
ROLES = ["admin", "manager", "member"]

# ---------------- Models ----------------
class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
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
    email: Optional[str] = None
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
    contact_person: str = ""
    status: str = "Active"


class ClientCreate(BaseModel):
    name: str
    contact_person: Optional[str] = ""
    status: Optional[str] = "Active"


class DeliverableInput(BaseModel):
    name: str
    type: Optional[str] = ""
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None


class ProjectCreate(BaseModel):
    name: str
    client_id: str
    start_date: str
    end_date: str
    poc_id: Optional[str] = None
    status: Optional[str] = "Planning"
    deliverables: Optional[List[DeliverableInput]] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    client_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    poc_id: Optional[str] = None
    status: Optional[str] = None


class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    client_id: str
    start_date: str
    end_date: str
    poc_id: Optional[str] = None
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


def gen_project_code() -> str:
    return "proj" + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))


def scoped_update_fields(user: User, existing: dict, update_fields: dict, creator_department: Optional[str] = None) -> dict:
    """Apply role-based restrictions to a raw update payload. Raises HTTPException on violation."""
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    if user.role == "member":
        if existing.get("creator_id") != user.id:
            raise HTTPException(status_code=403, detail="You can only edit your own work items")
        update_fields = {k: v for k, v in update_fields.items() if k in MEMBER_EDITABLE_FIELDS}
        if "status" in update_fields and update_fields["status"] not in MEMBER_FORWARD_STATUSES:
            raise HTTPException(status_code=403, detail="Members cannot set this status")
    elif user.role == "manager":
        if not creator_department or creator_department != user.department:
            raise HTTPException(status_code=403, detail="You can only edit work items logged by your own department")
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
        "work_categories": WORK_CATEGORIES,
        "statuses": STATUSES,
        "member_forward_statuses": MEMBER_FORWARD_STATUSES,
        "project_statuses": PROJECT_STATUSES,
        "stages": STAGES,
        "stage_statuses": STAGE_STATUSES,
        "client_statuses": CLIENT_STATUSES,
        "departments": DEPARTMENTS,
        "roles": ROLES,
    }


@api_router.get("/work-items", response_model=List[WorkItem])
async def list_work_items(
    request: Request,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    deliverable_type: Optional[str] = None,
    work_category: Optional[str] = None,
    month: Optional[str] = None,
    search: Optional[str] = None,
    creator_id: Optional[str] = None,
    project_id: Optional[str] = None,
    deliverable_id: Optional[str] = None,
):
    await get_acting_user(request)
    query = {}
    # Everyone can see everyone's rows; only editing is restricted by role/department.
    if creator_id:
        query["creator_id"] = creator_id
    if status:
        query["status"] = status
    if stage:
        query["stage"] = stage
    if deliverable_type:
        query["deliverable_type"] = deliverable_type
    if work_category:
        query["work_category"] = work_category
    if month:
        query["month"] = month
    if project_id:
        query["project_id"] = project_id
    if deliverable_id:
        query["deliverable_id"] = deliverable_id
    if search:
        query["$or"] = [
            {"deliverable_name": {"$regex": search, "$options": "i"}},
            {"remarks": {"$regex": search, "$options": "i"}},
        ]
    items = await db.work_items.find(query, {"_id": 0}).sort("work_date", -1).to_list(5000)
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
    ts = now_iso()
    item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
    await db.work_items.insert_one(item.model_dump())
    return item


@api_router.patch("/work-items/{item_id}", response_model=WorkItem)
async def update_work_item(item_id: str, payload: WorkItemUpdate, request: Request):
    user = await get_acting_user(request)
    existing = await db.work_items.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Work item not found")

    creator_department = await get_user_department(existing.get("creator_id"))
    update_fields = scoped_update_fields(user, existing, payload.model_dump(exclude_unset=True), creator_department)

    update_fields["updated_at"] = now_iso()
    await db.work_items.update_one({"id": item_id}, {"$set": update_fields})
    updated = await db.work_items.find_one({"id": item_id}, {"_id": 0})
    return updated


@api_router.post("/work-items/bulk-create", response_model=List[WorkItem])
async def bulk_create_work_items(payload: BulkCreatePayload, request: Request):
    user = await get_acting_user(request)
    if user.role == "admin":
        raise HTTPException(status_code=403, detail="Admins have view-only access to the Work Sheet")
    if payload.count < 1 or payload.count > 500:
        raise HTTPException(status_code=400, detail="count must be between 1 and 500")
    tpl = (payload.template or WorkItemCreate()).model_dump()
    work_date = tpl.pop("work_date", None) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    month = work_date[:7]
    ts = now_iso()
    docs = []
    for _ in range(payload.count):
        data = dict(tpl)
        if user.role == "member":
            data["creator_id"] = user.id
            data["reviewer_id"] = None
            data["manager_id"] = None
        else:
            data["creator_id"] = data.get("creator_id") or user.id
        item = WorkItem(work_date=work_date, month=month, created_at=ts, updated_at=ts, **data)
        docs.append(item.model_dump())
    if docs:
        await db.work_items.insert_many(docs)
    return docs


@api_router.post("/work-items/bulk-update", response_model=List[WorkItem])
async def bulk_update_work_items(payload: BulkUpdatePayload, request: Request):
    user = await get_acting_user(request)
    raw_fields = payload.patch.model_dump(exclude_unset=True)
    updated_items = []
    for item_id in payload.ids:
        existing = await db.work_items.find_one({"id": item_id}, {"_id": 0})
        if not existing:
            continue
        try:
            creator_department = await get_user_department(existing.get("creator_id"))
            update_fields = scoped_update_fields(user, existing, dict(raw_fields), creator_department)
        except HTTPException:
            continue
        update_fields["updated_at"] = now_iso()
        await db.work_items.update_one({"id": item_id}, {"$set": update_fields})
        updated_items.append(await db.work_items.find_one({"id": item_id}, {"_id": 0}))
    return updated_items


@api_router.post("/work-items/bulk-delete")
async def bulk_delete_work_items(payload: BulkDeletePayload, request: Request):
    await require_admin(request)
    result = await db.work_items.delete_many({"id": {"$in": payload.ids}})
    return {"deleted_count": result.deleted_count}


@api_router.delete("/work-items/{item_id}")
async def delete_work_item(item_id: str, request: Request):
    await require_admin(request)
    result = await db.work_items.delete_one({"id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Work item not found")
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
    contact_person: Optional[str] = None
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


# ---------------- Projects ----------------
def _project_code_exists_query(code: str) -> dict:
    return {"code": code}


async def _generate_unique_project_code() -> str:
    for _ in range(10):
        code = gen_project_code()
        if not await db.projects.find_one(_project_code_exists_query(code), {"_id": 0}):
            return code
    return gen_project_code()


async def _hydrate_project(p: dict) -> dict:
    """Attach deliverables + derived fields onto a raw project doc."""
    delivs = await db.deliverables.find({"project_id": p["id"]}, {"_id": 0}).to_list(1000)
    stage_counts = {s: 0 for s in STAGES}
    collaborators = set()
    for d in delivs:
        stage_counts[d.get("current_stage", "Content")] = stage_counts.get(d.get("current_stage", "Content"), 0) + 1
        if d.get("owner_id"):
            collaborators.add(d["owner_id"])
    client_doc = await db.clients.find_one({"id": p.get("client_id")}, {"_id": 0})
    return {
        **p,
        "deliverables": delivs,
        "deliverables_count": len(delivs),
        "stage_counts": stage_counts,
        "collaborator_ids": list(collaborators),
        "client_name": client_doc["name"] if client_doc else "",
    }


@api_router.get("/projects")
async def list_projects(
    request: Request,
    status: Optional[str] = None,
    search: Optional[str] = None,
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
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [await _hydrate_project(p) for p in projects]


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
    await require_admin(request)
    if payload.status and payload.status not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")
    client_doc = await db.clients.find_one({"id": payload.client_id}, {"_id": 0})
    if not client_doc:
        raise HTTPException(status_code=400, detail="Client not found")
    ts = now_iso()
    code = await _generate_unique_project_code()
    project = Project(
        code=code,
        name=payload.name,
        client_id=payload.client_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        poc_id=payload.poc_id,
        status=payload.status or "Planning",
        created_at=ts,
        updated_at=ts,
    )
    await db.projects.insert_one(project.model_dump())
    for d in payload.deliverables or []:
        deliv = Deliverable(
            project_id=project.id,
            name=d.name,
            type=d.type or "",
            owner_id=d.owner_id,
            start_dt=d.start_dt,
            end_dt=d.end_dt,
            current_stage="Content",
            stage_status="Not Started",
            created_at=ts,
            updated_at=ts,
        )
        await db.deliverables.insert_one(deliv.model_dump())
    p = await db.projects.find_one({"id": project.id}, {"_id": 0})
    return await _hydrate_project(p)


@api_router.patch("/projects/{project_id}")
async def update_project(project_id: str, payload: ProjectUpdate, request: Request):
    await require_admin(request)
    existing = await db.projects.find_one({"id": project_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Project not found")
    update_fields = payload.model_dump(exclude_unset=True)
    if "status" in update_fields and update_fields["status"] not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid project status")
    update_fields["updated_at"] = now_iso()
    await db.projects.update_one({"id": project_id}, {"$set": update_fields})
    p = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return await _hydrate_project(p)


@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, request: Request):
    await require_admin(request)
    result = await db.projects.delete_one({"id": project_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    await db.deliverables.delete_many({"project_id": project_id})
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


class DeliverableUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    owner_id: Optional[str] = None
    start_dt: Optional[str] = None
    end_dt: Optional[str] = None
    current_stage: Optional[str] = None
    stage_status: Optional[str] = None


@api_router.get("/deliverables", response_model=List[Deliverable])
async def list_deliverables(
    request: Request,
    project_id: Optional[str] = None,
):
    await get_acting_user(request)
    query = {"project_id": project_id} if project_id else {}
    return await db.deliverables.find(query, {"_id": 0}).sort("created_at", 1).to_list(5000)


@api_router.post("/deliverables", response_model=Deliverable)
async def create_deliverable(payload: DeliverableCreate, request: Request):
    await require_admin(request)
    if not await db.projects.find_one({"id": payload.project_id}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Project not found")
    ts = now_iso()
    d = Deliverable(created_at=ts, updated_at=ts, **payload.model_dump())
    await db.deliverables.insert_one(d.model_dump())
    return d


@api_router.patch("/deliverables/{deliverable_id}", response_model=Deliverable)
async def update_deliverable(deliverable_id: str, payload: DeliverableUpdate, request: Request):
    await require_admin(request)
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    update_fields = payload.model_dump(exclude_unset=True)
    if "current_stage" in update_fields and update_fields["current_stage"] not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")
    if "stage_status" in update_fields and update_fields["stage_status"] not in STAGE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid stage status")
    update_fields["updated_at"] = now_iso()
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update_fields})
    return await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})


@api_router.delete("/deliverables/{deliverable_id}")
async def delete_deliverable(deliverable_id: str, request: Request):
    await require_admin(request)
    result = await db.deliverables.delete_one({"id": deliverable_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Deliverable not found")
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
async def update_user(user_id: str, payload: UserUpdate, request: Request):
    await require_admin(request)
    existing = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    update_fields = payload.model_dump(exclude_unset=True)
    if "role" in update_fields and update_fields["role"] not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if "department" in update_fields and update_fields["department"] and update_fields["department"] not in DEPARTMENTS:
        raise HTTPException(status_code=400, detail="Invalid department")
    await db.users.update_one({"id": user_id}, {"$set": update_fields})
    return User(**{**existing, **update_fields})


# ---------------- Approvals (deliverable review queue) ----------------
def _next_stage(stage: str) -> Optional[str]:
    try:
        idx = STAGES.index(stage)
        return STAGES[idx + 1] if idx + 1 < len(STAGES) else None
    except ValueError:
        return None


@api_router.get("/approvals")
async def list_approvals(request: Request):
    """Deliverables waiting for review, hydrated with project + owner details."""
    await get_acting_user(request)
    delivs = await db.deliverables.find(
        {"stage_status": "Ready for Review"}, {"_id": 0}
    ).sort("updated_at", -1).to_list(500)
    project_ids = list({d["project_id"] for d in delivs})
    projects = {p["id"]: p for p in await db.projects.find({"id": {"$in": project_ids}}, {"_id": 0}).to_list(500)}
    users = {u["id"]: u for u in await db.users.find({}, {"_id": 0}).to_list(500)}
    clients = {c["id"]: c for c in await db.clients.find({}, {"_id": 0}).to_list(500)}
    result = []
    for d in delivs:
        p = projects.get(d["project_id"]) or {}
        owner = users.get(d.get("owner_id") or "") or {}
        client = clients.get(p.get("client_id") or "") or {}
        result.append({
            **d,
            "project_name": p.get("name", ""),
            "project_code": p.get("code", ""),
            "client_name": client.get("name", ""),
            "owner_name": owner.get("name", "Unassigned"),
        })
    return result


class ApprovalDecision(BaseModel):
    note: Optional[str] = ""


@api_router.post("/deliverables/{deliverable_id}/approve")
async def approve_deliverable(deliverable_id: str, payload: ApprovalDecision, request: Request):
    """Advance to next stage; if at Finish, mark Completed."""
    user = await get_acting_user(request)
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Only admin or manager can approve")
    existing = await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Deliverable not found")
    cur = existing.get("current_stage", "Content")
    nxt = _next_stage(cur)
    if nxt is None:
        update = {"stage_status": "Completed"}
    else:
        update = {"current_stage": nxt, "stage_status": "Not Started"}
    update["updated_at"] = now_iso()
    update["last_review_note"] = payload.note or ""
    update["last_review_action"] = "approved"
    update["last_reviewer_id"] = user.id
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
    update = {
        "stage_status": "Changes Requested",
        "updated_at": now_iso(),
        "last_review_note": payload.note or "",
        "last_review_action": "rejected",
        "last_reviewer_id": user.id,
    }
    await db.deliverables.update_one({"id": deliverable_id}, {"$set": update})
    return await db.deliverables.find_one({"id": deliverable_id}, {"_id": 0})


# ---------------- Dashboard overview (project-centric) ----------------
@api_router.get("/dashboard/overview")
async def dashboard_overview(request: Request):
    await require_admin(request)
    projects = await db.projects.find({}, {"_id": 0}).to_list(1000)
    deliverables = await db.deliverables.find({}, {"_id": 0}).to_list(5000)
    work_items = await db.work_items.find({}, {"_id": 0}).to_list(10000)
    today = datetime.now(timezone.utc).date()
    week_end = today + timedelta(days=7)
    project_status_counts = {s: 0 for s in PROJECT_STATUSES}
    for p in projects:
        project_status_counts[p.get("status", "Planning")] = project_status_counts.get(p.get("status", "Planning"), 0) + 1
    deliv_stage_counts = {s: 0 for s in STAGES}
    for d in deliverables:
        deliv_stage_counts[d.get("current_stage", "Content")] = deliv_stage_counts.get(d.get("current_stage", "Content"), 0) + 1
    needs_review = sum(1 for d in deliverables if d.get("stage_status") in ("Ready for Review", "Changes Requested"))
    due_this_week = 0
    for p in projects:
        try:
            d = datetime.fromisoformat(p.get("end_date")).date()
            if today <= d <= week_end and p.get("status") != "Completed":
                due_this_week += 1
        except (ValueError, TypeError):
            continue
    total_minutes = sum(w.get("time_taken_minutes", 0) or 0 for w in work_items)
    return {
        "active_projects": project_status_counts.get("Active", 0),
        "in_rework": project_status_counts.get("In Rework", 0),
        "completed_projects": project_status_counts.get("Completed", 0),
        "planning_projects": project_status_counts.get("Planning", 0),
        "total_projects": len(projects),
        "total_deliverables": len(deliverables),
        "deliv_stage_counts": deliv_stage_counts,
        "needs_review": needs_review,
        "due_this_week": due_this_week,
        "total_hours_logged": round(total_minutes / 60, 1),
        "total_work_items": len(work_items),
        "project_status_counts": project_status_counts,
    }


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


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()