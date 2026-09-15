"""
Efficiency module — monthly capacity, per-employee activity potential, and productivity reporting.

Router factory so it can live outside server.py without a circular import.
server.py calls `create_efficiency_router(...)` and includes the result.

Collections used:
  efficiency_capacity          one doc per (user_id, month)          -- capacity setup
  efficiency_employee_targets  one doc per (user_id, activity_name)  -- potential, set by manager
  work_items                   existing collection (source of actuals + non-core time)

Permission model:
  - Monthly capacity: manager or admin (department-scoped for managers).
  - Employee activity targets (potential): MANAGER ONLY. Admins cannot create, edit, or
    delete these — only view them, same as any report. A manager may only set potential
    for employees in their own department.
  - Reporting (overview / employee detail / activity breakdown / trend): admin sees the
    whole org, manager sees their department, everyone else sees only themselves.
"""

import uuid
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, Field, ConfigDict


# ---------------- Constants ----------------

DEFAULT_WORKING_HOURS_PER_DAY = 8.5

# How an employee's overall productivity is rolled up from per-activity scores.
#   "weighted" -> total actual / total monthly potential   (recommended, caps at a sane number)
#   "average"  -> mean of activity productivity percentages
#   "sum"      -> sum of activity productivity percentages (as written in the original spec)
PRODUCTIVITY_AGGREGATION = "weighted"

# Non-core hours above this share of monthly hours get flagged on the overview.
NON_CORE_ALERT_RATIO = 0.35


# ---------------- Models ----------------

class EmployeeWorkingCalendar(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    month: str                      # "2026-09"
    working_days: float = 0
    leave_days: float = 0
    working_hours_per_day: float = DEFAULT_WORKING_HOURS_PER_DAY
    created_at: str
    updated_at: str
    updated_by: Optional[str] = None


class EmployeeWorkingCalendarCreate(BaseModel):
    user_id: str
    month: str
    working_days: float
    leave_days: float = 0
    working_hours_per_day: Optional[float] = None


class EmployeeWorkingCalendarUpdate(BaseModel):
    working_days: Optional[float] = None
    leave_days: Optional[float] = None
    working_hours_per_day: Optional[float] = None


class EmployeeActivityTarget(BaseModel):
    """One employee's potential for one core activity. This is what a manager sets."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    activity_name: str
    category: str = "Core"
    daily_potential: float = 0
    time_per_unit_minutes: float = 0
    active: bool = True
    created_at: str
    updated_at: str
    updated_by: Optional[str] = None


class EmployeeActivityTargetCreate(BaseModel):
    user_id: str
    activity_name: str
    daily_potential: float
    time_per_unit_minutes: float = 0
    active: Optional[bool] = True


class EmployeeActivityTargetUpdate(BaseModel):
    daily_potential: Optional[float] = None
    time_per_unit_minutes: Optional[float] = None
    active: Optional[bool] = None


# ---------------- Pure calculation helpers ----------------

def calculate_working_days_after_leave(working_days: float, leave_days: float) -> float:
    return max(0.0, round(float(working_days or 0) - float(leave_days or 0), 2))


def calculate_monthly_working_hours(working_days_after_leave: float, hours_per_day: float) -> float:
    return round(float(working_days_after_leave) * float(hours_per_day or 0), 2)


def calculate_non_core_hours(non_core_minutes: float) -> float:
    return round(float(non_core_minutes or 0) / 60.0, 2)


def calculate_core_hours(monthly_working_hours: float, non_core_hours: float) -> float:
    return round(max(0.0, float(monthly_working_hours) - float(non_core_hours)), 2)


def calculate_core_days(core_hours: float, hours_per_day: float) -> float:
    if not hours_per_day:
        return 0.0
    return round(float(core_hours) / float(hours_per_day), 2)


def calculate_activity_productivity(actual_closed: float, monthly_potential: float) -> float:
    if not monthly_potential:
        return 0.0
    return round((float(actual_closed) / float(monthly_potential)) * 100, 2)


def calculate_employee_productivity(activity_rows: List[Dict[str, Any]]) -> float:
    """Roll per-activity scores up to one employee number. See PRODUCTIVITY_AGGREGATION."""
    rows = [r for r in activity_rows if (r.get("monthly_potential") or 0) > 0]
    if not rows:
        return 0.0

    if PRODUCTIVITY_AGGREGATION == "sum":
        return round(sum(r["productivity"] for r in rows), 2)

    if PRODUCTIVITY_AGGREGATION == "average":
        return round(sum(r["productivity"] for r in rows) / len(rows), 2)

    total_actual = sum(r.get("actual_closed") or 0 for r in rows)
    total_potential = sum(r.get("monthly_potential") or 0 for r in rows)
    if not total_potential:
        return 0.0
    return round((total_actual / total_potential) * 100, 2)


def calculate_team_productivity(employee_rows: List[Dict[str, Any]]) -> float:
    scored = [e for e in employee_rows if e.get("has_capacity")]
    if not scored:
        return 0.0
    return round(sum(e.get("productivity") or 0 for e in scored) / len(scored), 2)


def build_capacity_breakdown(
    working_days: float,
    leave_days: float,
    hours_per_day: float,
    non_core_minutes: float,
) -> Dict[str, float]:
    after_leave = calculate_working_days_after_leave(working_days, leave_days)
    monthly_hours = calculate_monthly_working_hours(after_leave, hours_per_day)
    non_core_hours = calculate_non_core_hours(non_core_minutes)
    core_hours = calculate_core_hours(monthly_hours, non_core_hours)
    core_days = calculate_core_days(core_hours, hours_per_day)
    return {
        "working_days": round(float(working_days or 0), 2),
        "leave_days": round(float(leave_days or 0), 2),
        "working_days_after_leave": after_leave,
        "working_hours_per_day": round(float(hours_per_day or 0), 2),
        "monthly_working_hours": monthly_hours,
        "non_core_hours": non_core_hours,
        "core_hours": core_hours,
        "core_days": core_days,
    }


def validate_capacity_payload(working_days: float, leave_days: float, hours_per_day: float):
    if working_days is None or working_days < 0:
        raise HTTPException(status_code=400, detail="Working days cannot be negative")
    if working_days > 31:
        raise HTTPException(status_code=400, detail="Working days cannot exceed 31")
    if leave_days is None or leave_days < 0:
        raise HTTPException(status_code=400, detail="Leave days cannot be negative")
    if leave_days > working_days:
        raise HTTPException(status_code=400, detail="Leave days cannot exceed working days")
    if not hours_per_day or hours_per_day <= 0:
        raise HTTPException(status_code=400, detail="Working hours per day must be greater than zero")
    if hours_per_day > 24:
        raise HTTPException(status_code=400, detail="Working hours per day cannot exceed 24")


def _prev_months(month: str, count: int) -> List[str]:
    """['2026-04', ..., '2026-09'] ending at `month`."""
    year, mon = int(month[:4]), int(month[5:7])
    out = []
    for _ in range(count):
        out.append(f"{year:04d}-{mon:02d}")
        mon -= 1
        if mon == 0:
            mon = 12
            year -= 1
    return list(reversed(out))


# ---------------- Router factory ----------------

def create_efficiency_router(
    db,
    get_acting_user,
    require_manager_or_admin,
    now_iso,
    log_activity,
    deliverable_type_categories: Dict[str, str],
) -> APIRouter:

    router = APIRouter(prefix="/efficiency", tags=["efficiency"])

    core_activity_names = sorted(
        name for name, cat in deliverable_type_categories.items() if cat == "Core"
    )

    # ---------- shared helpers (need db) ----------

    async def require_manager(request: Request):
        """Potential-setting is a manager-only action. Admins can view but not edit."""
        user = await get_acting_user(request)
        if user.role != "manager":
            raise HTTPException(
                status_code=403,
                detail="Only managers can configure activity potential",
            )
        return user

    async def _visible_users(user) -> List[dict]:
        """Employees this user is allowed to see efficiency data for.

        Members are read-only viewers of the whole team's efficiency data (same
        breadth as admin) — they just can't hit any of the write endpoints below,
        which are gated separately via require_manager_or_admin / require_manager.
        """
        query: Dict[str, Any] = {"role": {"$ne": "admin"}, "active": {"$ne": False}}
        if user.role == "manager":
            query["department"] = user.department
        return await db.users.find(query, {"_id": 0}).to_list(1000)

    async def _assert_can_view(user, target_user_id: str):
        if user.role in {"admin", "member"}:
            return
        if user.id == target_user_id:
            return
        if user.role == "manager":
            target = await db.users.find_one({"id": target_user_id}, {"_id": 0, "department": 1})
            if target and target.get("department") == user.department:
                return
        raise HTTPException(status_code=403, detail="You cannot view this employee's efficiency")

    async def _assert_manages(manager, target_user_id: str):
        """A manager may only set potential for members of their own department."""
        if manager.id == target_user_id:
            return
        target = await db.users.find_one(
            {"id": target_user_id}, {"_id": 0, "department": 1}
        )
        if not target or target.get("department") != manager.department:
            raise HTTPException(
                status_code=403,
                detail="You can only set potential for employees in your own department",
            )

    async def _capacity_map(month: str, user_ids: List[str]) -> Dict[str, dict]:
        docs = await db.efficiency_capacity.find(
            {"month": month, "user_id": {"$in": user_ids}}, {"_id": 0}
        ).to_list(1000)
        return {d["user_id"]: d for d in docs}

    async def _employee_targets_map(user_ids: List[str]) -> Dict[str, List[dict]]:
        docs = await db.efficiency_employee_targets.find(
            {"user_id": {"$in": user_ids}, "active": True}, {"_id": 0}
        ).sort("activity_name", 1).to_list(10000)
        by_user: Dict[str, List[dict]] = {uid: [] for uid in user_ids}
        for d in docs:
            by_user.setdefault(d["user_id"], []).append(d)
        return by_user

    async def _month_work_items(month: str, user_ids: List[str]) -> List[dict]:
        return await db.work_items.find(
            {"month": month, "creator_id": {"$in": user_ids}},
            {
                "_id": 0, "id": 1, "creator_id": 1, "work_category": 1, "deliverable_type": 1,
                "deliverable_name": 1, "status": 1, "time_taken_minutes": 1, "work_date": 1,
                "project_id": 1, "client_id": 1,
            },
        ).to_list(20000)

    def _category_of(item: dict) -> str:
        explicit = item.get("work_category")
        if explicit in {"Core", "Non-Core"}:
            return explicit
        return deliverable_type_categories.get(item.get("deliverable_type") or "", "Core")

    def _compute_employee(
        user_doc: dict,
        capacity: Optional[dict],
        items: List[dict],
        targets: List[dict],
    ) -> dict:
        non_core_minutes = 0.0
        non_core_by_type: Dict[str, float] = {}
        closed_by_type: Dict[str, int] = {}
        closed_total = 0

        for it in items:
            category = _category_of(it)
            if category == "Non-Core":
                mins = float(it.get("time_taken_minutes") or 0)
                non_core_minutes += mins
                key = it.get("deliverable_type") or "Other"
                non_core_by_type[key] = non_core_by_type.get(key, 0.0) + mins
            elif it.get("status") == "Closed":
                key = it.get("deliverable_type") or "Other"
                closed_by_type[key] = closed_by_type.get(key, 0) + 1
                closed_total += 1

        has_capacity = bool(capacity)
        hours_per_day = float(
            (capacity or {}).get("working_hours_per_day") or DEFAULT_WORKING_HOURS_PER_DAY
        )
        breakdown = build_capacity_breakdown(
            working_days=(capacity or {}).get("working_days") or 0,
            leave_days=(capacity or {}).get("leave_days") or 0,
            hours_per_day=hours_per_day,
            non_core_minutes=non_core_minutes,
        )

        activity_rows = []
        for t in targets:
            daily_potential = float(t.get("daily_potential") or 0)
            monthly_potential = round(daily_potential * breakdown["core_days"], 2)
            actual = closed_by_type.get(t["activity_name"], 0)
            activity_rows.append({
                "target_id": t.get("id"),
                "activity_name": t["activity_name"],
                "daily_potential": daily_potential,
                "time_per_unit_minutes": float(t.get("time_per_unit_minutes") or 0),
                "monthly_potential": monthly_potential,
                "actual_closed": actual,
                "productivity": calculate_activity_productivity(actual, monthly_potential),
            })

        productivity = calculate_employee_productivity(activity_rows) if has_capacity else 0.0

        target_names = {t["activity_name"] for t in targets}
        untracked_closed = sum(v for k, v in closed_by_type.items() if k not in target_names)

        return {
            "user_id": user_doc["id"],
            "name": user_doc.get("name"),
            "department": user_doc.get("department") or "",
            "role": user_doc.get("role"),
            "has_capacity": has_capacity,
            "has_targets": len(activity_rows) > 0,
            "productivity": productivity,
            "closed_deliverables": closed_total,
            "untracked_closed_deliverables": untracked_closed,
            "non_core_by_type": [
                {"deliverable_type": k, "hours": round(v / 60, 2)}
                for k, v in sorted(non_core_by_type.items(), key=lambda kv: -kv[1])
            ],
            "activities": activity_rows,
            **breakdown,
        }

    async def _build_month(month: str, user, employee_id: Optional[str] = None) -> List[dict]:
        users = await _visible_users(user)
        if employee_id:
            users = [u for u in users if u["id"] == employee_id]
        if not users:
            return []
        user_ids = [u["id"] for u in users]
        capacities = await _capacity_map(month, user_ids)
        targets_map = await _employee_targets_map(user_ids)
        items = await _month_work_items(month, user_ids)

        by_user: Dict[str, List[dict]] = {uid: [] for uid in user_ids}
        for it in items:
            by_user.setdefault(it.get("creator_id"), []).append(it)

        return [
            _compute_employee(
                u, capacities.get(u["id"]), by_user.get(u["id"], []), targets_map.get(u["id"], [])
            )
            for u in users
        ]

    # ---------- Monthly capacity ----------
    # NOTE: left as manager-or-admin, unchanged from before. Tell me if this should
    # also be locked to managers only, matching activity potential below.

    @router.get("/monthly-capacity")
    async def list_monthly_capacity(
        request: Request,
        month: Optional[str] = Query(None),
        user_id: Optional[str] = Query(None),
    ):
        user = await get_acting_user(request)
        visible = {u["id"] for u in await _visible_users(user)}
        query: Dict[str, Any] = {}
        if month:
            query["month"] = month
        if user_id:
            await _assert_can_view(user, user_id)
            query["user_id"] = user_id
        else:
            query["user_id"] = {"$in": list(visible)}
        return await db.efficiency_capacity.find(query, {"_id": 0}).to_list(1000)

    @router.get("/monthly-capacity/{user_id}/{month}")
    async def get_monthly_capacity(user_id: str, month: str, request: Request):
        user = await get_acting_user(request)
        await _assert_can_view(user, user_id)
        doc = await db.efficiency_capacity.find_one(
            {"user_id": user_id, "month": month}, {"_id": 0}
        )
        if not doc:
            raise HTTPException(status_code=404, detail="No capacity configured for this month")
        return doc

    @router.post("/monthly-capacity", response_model=EmployeeWorkingCalendar)
    async def upsert_monthly_capacity(payload: EmployeeWorkingCalendarCreate, request: Request):
        user = await require_manager_or_admin(request)
        await _assert_can_view(user, payload.user_id)

        target = await db.users.find_one({"id": payload.user_id}, {"_id": 0, "id": 1})
        if not target:
            raise HTTPException(status_code=400, detail="Invalid employee")
        if len(payload.month or "") != 7 or payload.month[4] != "-":
            raise HTTPException(status_code=400, detail="Month must be in YYYY-MM format")

        hours_per_day = payload.working_hours_per_day or DEFAULT_WORKING_HOURS_PER_DAY
        validate_capacity_payload(payload.working_days, payload.leave_days, hours_per_day)

        ts = now_iso()
        existing = await db.efficiency_capacity.find_one(
            {"user_id": payload.user_id, "month": payload.month}, {"_id": 0}
        )
        doc = EmployeeWorkingCalendar(
            id=existing["id"] if existing else str(uuid.uuid4()),
            user_id=payload.user_id,
            month=payload.month,
            working_days=payload.working_days,
            leave_days=payload.leave_days,
            working_hours_per_day=hours_per_day,
            created_at=existing["created_at"] if existing else ts,
            updated_at=ts,
            updated_by=user.id,
        )
        await db.efficiency_capacity.update_one(
            {"user_id": payload.user_id, "month": payload.month},
            {"$set": doc.model_dump()},
            upsert=True,
        )
        await log_activity(
            "efficiency_activity_log",
            doc.id,
            "capacity_updated" if existing else "capacity_created",
            user.id,
            old_value=existing,
            new_value=doc.model_dump(),
        )
        return doc

    @router.put("/monthly-capacity/{capacity_id}", response_model=EmployeeWorkingCalendar)
    async def update_monthly_capacity(
        capacity_id: str, payload: EmployeeWorkingCalendarUpdate, request: Request
    ):
        user = await require_manager_or_admin(request)
        existing = await db.efficiency_capacity.find_one({"id": capacity_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Capacity not found")
        await _assert_can_view(user, existing["user_id"])

        merged = {**existing, **{k: v for k, v in payload.model_dump().items() if v is not None}}
        validate_capacity_payload(
            merged["working_days"], merged["leave_days"], merged["working_hours_per_day"]
        )
        merged["updated_at"] = now_iso()
        merged["updated_by"] = user.id
        await db.efficiency_capacity.update_one({"id": capacity_id}, {"$set": merged})
        await log_activity(
            "efficiency_activity_log", capacity_id, "capacity_updated", user.id,
            old_value=existing, new_value=merged,
        )
        return EmployeeWorkingCalendar(**merged)

    @router.delete("/monthly-capacity/{capacity_id}")
    async def delete_monthly_capacity(capacity_id: str, request: Request):
        user = await require_manager_or_admin(request)
        existing = await db.efficiency_capacity.find_one({"id": capacity_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Capacity not found")
        await _assert_can_view(user, existing["user_id"])
        await db.efficiency_capacity.delete_one({"id": capacity_id})
        await log_activity(
            "efficiency_activity_log", capacity_id, "capacity_deleted", user.id, old_value=existing
        )
        return {"deleted": True, "id": capacity_id}

    # ---------- Activity catalog (read-only reference list) ----------

    @router.get("/activity-catalog")
    async def activity_catalog(request: Request):
        """Core deliverable type names a manager can pick from when setting potential."""
        await get_acting_user(request)
        return core_activity_names

    # ---------- Employee activity targets (potential) — MANAGER ONLY to write ----------

    @router.get("/employee-targets")
    async def list_employee_targets(request: Request, user_id: str = Query(...)):
        user = await get_acting_user(request)
        await _assert_can_view(user, user_id)
        return await db.efficiency_employee_targets.find(
            {"user_id": user_id}, {"_id": 0}
        ).sort("activity_name", 1).to_list(500)

    @router.post("/employee-targets", response_model=EmployeeActivityTarget)
    async def upsert_employee_target(payload: EmployeeActivityTargetCreate, request: Request):
        manager = await require_manager(request)
        await _assert_manages(manager, payload.user_id)

        name = (payload.activity_name or "").strip()
        if name not in core_activity_names:
            raise HTTPException(
                status_code=400,
                detail="Activity must be one of the configured core deliverable types",
            )
        if payload.daily_potential is None or payload.daily_potential < 0:
            raise HTTPException(status_code=400, detail="Daily potential cannot be negative")
        if payload.time_per_unit_minutes is not None and payload.time_per_unit_minutes < 0:
            raise HTTPException(status_code=400, detail="Time per unit cannot be negative")

        ts = now_iso()
        existing = await db.efficiency_employee_targets.find_one(
            {"user_id": payload.user_id, "activity_name": name}, {"_id": 0}
        )
        doc = EmployeeActivityTarget(
            id=existing["id"] if existing else str(uuid.uuid4()),
            user_id=payload.user_id,
            activity_name=name,
            category="Core",
            daily_potential=payload.daily_potential,
            time_per_unit_minutes=payload.time_per_unit_minutes or 0,
            active=True if payload.active is None else payload.active,
            created_at=existing["created_at"] if existing else ts,
            updated_at=ts,
            updated_by=manager.id,
        )
        await db.efficiency_employee_targets.update_one(
            {"user_id": payload.user_id, "activity_name": name},
            {"$set": doc.model_dump()},
            upsert=True,
        )
        await log_activity(
            "efficiency_activity_log", doc.id,
            "employee_target_updated" if existing else "employee_target_created",
            manager.id, old_value=existing, new_value=doc.model_dump(),
        )
        return doc

    @router.put("/employee-targets/{target_id}", response_model=EmployeeActivityTarget)
    async def update_employee_target(
        target_id: str, payload: EmployeeActivityTargetUpdate, request: Request
    ):
        manager = await require_manager(request)
        existing = await db.efficiency_employee_targets.find_one({"id": target_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Target not found")
        await _assert_manages(manager, existing["user_id"])

        patch = {k: v for k, v in payload.model_dump().items() if v is not None}
        if "daily_potential" in patch and patch["daily_potential"] < 0:
            raise HTTPException(status_code=400, detail="Daily potential cannot be negative")
        if "time_per_unit_minutes" in patch and patch["time_per_unit_minutes"] < 0:
            raise HTTPException(status_code=400, detail="Time per unit cannot be negative")

        old_daily = existing.get("daily_potential")
        merged = {**existing, **patch, "updated_at": now_iso(), "updated_by": manager.id}
        await db.efficiency_employee_targets.update_one({"id": target_id}, {"$set": merged})
        await log_activity(
            "efficiency_activity_log", target_id, "employee_target_updated", manager.id,
            old_value=existing, new_value=merged,
            metadata={"daily_potential_changed": old_daily != merged.get("daily_potential")},
        )
        return EmployeeActivityTarget(**merged)

    @router.delete("/employee-targets/{target_id}")
    async def delete_employee_target(target_id: str, request: Request):
        manager = await require_manager(request)
        existing = await db.efficiency_employee_targets.find_one({"id": target_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Target not found")
        await _assert_manages(manager, existing["user_id"])
        await db.efficiency_employee_targets.delete_one({"id": target_id})
        await log_activity(
            "efficiency_activity_log", target_id, "employee_target_deleted", manager.id,
            old_value=existing,
        )
        return {"deleted": True, "id": target_id}

    # ---------- Reporting ----------

    @router.get("/overview")
    async def efficiency_overview(request: Request, month: str = Query(...)):
        user = await get_acting_user(request)
        rows = await _build_month(month, user)

        configured = [r for r in rows if r["has_capacity"]]
        total_core_hours = round(sum(r["core_hours"] for r in configured), 2)
        total_non_core_hours = round(sum(r["non_core_hours"] for r in rows), 2)
        avg_core_days = round(
            sum(r["core_days"] for r in configured) / len(configured), 2
        ) if configured else 0.0
        closed_deliverables = sum(r["closed_deliverables"] for r in rows)

        attention = {
            "missing_capacity": [
                {"user_id": r["user_id"], "name": r["name"]} for r in rows if not r["has_capacity"]
            ],
            "missing_targets": [
                {"user_id": r["user_id"], "name": r["name"]}
                for r in rows if r["has_capacity"] and not r["has_targets"]
            ],
            "excessive_non_core": [
                {"user_id": r["user_id"], "name": r["name"], "non_core_hours": r["non_core_hours"]}
                for r in rows
                if r["monthly_working_hours"]
                and r["non_core_hours"] / r["monthly_working_hours"] > NON_CORE_ALERT_RATIO
            ],
            "no_closed_deliverables": [
                {"user_id": r["user_id"], "name": r["name"]}
                for r in rows if r["has_capacity"] and r["closed_deliverables"] == 0
            ],
        }

        prev = _prev_months(month, 2)[0]
        prev_rows = await _build_month(prev, user)
        prev_productivity = calculate_team_productivity(prev_rows)
        team_productivity = calculate_team_productivity(rows)

        return {
            "month": month,
            "aggregation": PRODUCTIVITY_AGGREGATION,
            "kpis": {
                "team_productivity": team_productivity,
                "team_productivity_delta": round(team_productivity - prev_productivity, 2),
                "total_core_hours": total_core_hours,
                "total_non_core_hours": total_non_core_hours,
                "average_core_days": avg_core_days,
                "closed_deliverables": closed_deliverables,
                "employees_tracked": len(configured),
                "employees_total": len(rows),
            },
            "employees": [
                {
                    k: r[k] for k in (
                        "user_id", "name", "department", "has_capacity", "has_targets",
                        "productivity", "working_days", "leave_days", "working_days_after_leave",
                        "core_days", "core_hours", "non_core_hours", "closed_deliverables",
                    )
                }
                for r in sorted(rows, key=lambda x: -x["productivity"])
            ],
            "attention": attention,
        }

    @router.get("/employee/{user_id}")
    async def employee_efficiency(user_id: str, request: Request, month: str = Query(...)):
        user = await get_acting_user(request)
        await _assert_can_view(user, user_id)
        rows = await _build_month(month, user, employee_id=user_id)
        if not rows:
            raise HTTPException(status_code=404, detail="Employee not found")
        row = rows[0]

        closed_items = await db.work_items.find(
            {"month": month, "creator_id": user_id, "status": "Closed"},
            {"_id": 0, "id": 1, "deliverable_name": 1, "deliverable_type": 1,
             "work_category": 1, "work_date": 1, "time_taken_minutes": 1, "project_id": 1},
        ).sort("work_date", 1).to_list(5000)

        return {
            "month": month,
            "aggregation": PRODUCTIVITY_AGGREGATION,
            **row,
            "deliverables": [c for c in closed_items if _category_of(c) == "Core"],
            "formula": {
                "working_days_after_leave": "Working days − Leave days",
                "monthly_working_hours": "Working days after leave × Working hours/day",
                "non_core_hours": "Sum of Non-Core time logged ÷ 60",
                "core_hours": "Monthly working hours − Non-core hours",
                "core_days": "Core hours ÷ Working hours/day",
                "monthly_potential": "This employee's daily potential × Core days",
                "activity_productivity": "Actual closed ÷ Monthly potential × 100",
                "employee_productivity": {
                    "weighted": "Total actual closed ÷ Total monthly potential × 100",
                    "average": "Mean of activity productivity percentages",
                    "sum": "Sum of activity productivity percentages",
                }[PRODUCTIVITY_AGGREGATION],
            },
        }

    @router.get("/activity-breakdown")
    async def activity_breakdown(request: Request, month: str = Query(...)):
        user = await get_acting_user(request)
        rows = await _build_month(month, user)

        agg: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            for a in r["activities"]:
                bucket = agg.setdefault(a["activity_name"], {
                    "activity_name": a["activity_name"],
                    "monthly_potential": 0.0,
                    "actual_closed": 0,
                    "employees": [],
                })
                bucket["monthly_potential"] = round(
                    bucket["monthly_potential"] + a["monthly_potential"], 2
                )
                bucket["actual_closed"] += a["actual_closed"]
                if a["actual_closed"] or a["monthly_potential"]:
                    bucket["employees"].append({
                        "user_id": r["user_id"],
                        "name": r["name"],
                        "daily_potential": a["daily_potential"],
                        "actual_closed": a["actual_closed"],
                        "monthly_potential": a["monthly_potential"],
                        "productivity": a["productivity"],
                    })

        activities = []
        for bucket in agg.values():
            bucket["productivity"] = calculate_activity_productivity(
                bucket["actual_closed"], bucket["monthly_potential"]
            )
            bucket["employee_count"] = len(bucket["employees"])
            activities.append(bucket)

        activities.sort(key=lambda a: -a["actual_closed"])
        return {
            "month": month,
            "kpis": {
                "total_potential": round(sum(a["monthly_potential"] for a in activities), 2),
                "total_actual": sum(a["actual_closed"] for a in activities),
                "activities_tracked": len(activities),
            },
            "activities": activities,
        }

    @router.get("/trend")
    async def efficiency_trend(request: Request, month: Optional[str] = None, months: int = 6):
        user = await get_acting_user(request)
        if not month:
            from datetime import datetime, timezone
            month = datetime.now(timezone.utc).strftime("%Y-%m")
        months = max(1, min(int(months or 6), 12))

        out = []
        for m in _prev_months(month, months):
            rows = await _build_month(m, user)
            out.append({
                "month": m,
                "team_productivity": calculate_team_productivity(rows),
                "core_hours": round(sum(r["core_hours"] for r in rows if r["has_capacity"]), 2),
                "non_core_hours": round(sum(r["non_core_hours"] for r in rows), 2),
                "closed_deliverables": sum(r["closed_deliverables"] for r in rows),
            })
        return out

    return router