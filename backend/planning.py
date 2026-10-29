"""Task assignment and planning (WhatsApp tasklists -> Planning page + task cards).

The WhatsApp listener (whatsapp-pmt-listener) reads each manager's daily
tasklist, runs the NLP matcher and stores one document per task line in
`tasklist_items`. This module is the PMT side of that hand-off. It does not
parse or match anything; it only serves, validates and moves those documents.

Life cycle of a `tasklist_items` document (field `status`):

    needs_review --resolve--> pending --accept--> accepted   (Work Sheet row made)
         |                       |  \\--decline--> declined --reassign--> pending
         \\--reject--> rejected    \\--reassign--> pending (another person)

A line is only `pending` when the matcher was certain and every id was
re-checked against the live data (see mongoStore.js). Anything unsure waits in
`needs_review` until a manager picks the project / deliverable by hand: nothing
is assigned by guesswork.

  Team members (everyone who logs work: members and managers; not admin / hr)
    GET  /planning/my-tasks                  the "Task assigned to you" cards
    POST /planning/my-tasks/{id}/accept      adds the row to the member's Work Sheet
    POST /planning/my-tasks/{id}/decline     {reason, message}
    POST /planning/my-tasks/{id}/ask         {message}   (task stays in the queue)

  Managers (their own department) and admins
    GET  /planning/overview                  what the Planning page draws
    POST /planning/tasks/{id}/reassign       {to_user_id}
    GET  /planning/review?status=...         needs_review (default) | declined
    POST /planning/review/{id}/resolve       {project_id, deliverable_id?, assignee_user_id?}
    POST /planning/review/{id}/reject        {reason?}
    GET  /planning/learned-rules             what the matcher learned from those decisions
    POST /planning/learned-rules/disabled    {id, disabled}   switch a rule off / on

Collections used
    tasklist_items     read / update (written by the listener)
    nlp_match_logs     update only: records what the human decided
    nlp_learned_rules  written by the listener from those decisions; only `disabled` is changed here
    work_items         insert, through the existing create_work_item()
    notifications      insert, through the existing notification helper
    users / clients / projects / deliverables   read only
"""
import asyncio
import os
import re
import uuid
from datetime import date, date as date_type, datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Awaitable, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict

IST = timezone(timedelta(hours=5, minutes=30))

ITEMS = "tasklist_items"
LOGS = "nlp_match_logs"

# Planning page: the three production departments, and a working day.
PLAN_DEPARTMENTS = ("Content", "Design", "Animation")
# tasklist team (as the WhatsApp listener writes it) -> PMT department. Every
# department in PLAN_DEPARTMENTS needs an entry: a task for a team that is not
# listed here is stored but never shown to anyone.
TEAM_DEPARTMENT = {"content": "Content", "design": "Design", "animation": "Animation"}
DAY_START = 9.5
DAY_END = 18.0

# Days nobody is planned for. Weekends always count; add public holidays with
# PLANNING_HOLIDAYS="2026-11-08:Diwali,2026-12-25:Christmas" (name optional).
def _holidays_from_env() -> Dict[str, str]:
    found: Dict[str, str] = {}
    for part in os.environ.get("PLANNING_HOLIDAYS", "").split(","):
        day, _, name = part.strip().partition(":")
        if day:
            found[day] = name.strip() or "Holiday"
    return found


HOLIDAYS = _holidays_from_env()


def holiday_name(day: date) -> str:
    """"" on a normal working day, otherwise what the day is called."""
    if day.isoformat() in HOLIDAYS:
        return HOLIDAYS[day.isoformat()]
    return day.strftime("%A") if day.weekday() >= 5 else ""

# The tasklist carries no estimate, so every task is planned at this size until
# a person changes it. Shown to the assignee as the card's "Estimate".
DEFAULT_ESTIMATE_MINUTES = float(os.environ.get("PLANNING_DEFAULT_ESTIMATE_MINUTES", "60"))

# An "accepting" claim older than this is a crashed request, not a live one.
CLAIM_STALE_SECONDS = 120

# A task card nobody clicks Accept or Decline on is accepted for the person
# after this long (0 turns it off). The clock starts when the card became
# visible to them: posted, released by a manager's review, or reassigned.
AUTO_ACCEPT_AFTER_MINUTES = float(os.environ.get("PLANNING_AUTO_ACCEPT_MINUTES", "60"))

# A task whose auto-accept failed (project hidden or merged since it was queued,
# a Work Sheet rule refused it) is left on the person's card and tried again
# only after this long, so one bad task is not retried every minute.
AUTO_ACCEPT_RETRY_MINUTES = 15

OPEN_STATUSES = ("pending", "accepted")
WORK_ITEM_DONE = ("Closed", "Scrap")
# What a task counts as when its Work Sheet row no longer exists (see work_status_map).
MISSING_ROW_STATUS = "Closed"
WORK_ITEM_SENT_BACK = ("Changes Requested", "Rework")
WORK_ITEM_ACTIVE = ("Ongoing", "Ready for Review", "Changes Requested", "Rework", "On Hold")

TEST_ACCOUNT = re.compile(r"\btest(ing)?\b", re.I)


class DeclinePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: str
    message: Optional[str] = ""


class AskPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    message: str


class ReassignPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    to_user_id: str


class ResolvePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    project_id: str
    deliverable_id: Optional[str] = None
    assignee_user_id: Optional[str] = None


class RuleSwitchPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    disabled: bool


class RejectPayload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    reason: Optional[str] = ""


# ---------------------------------------------------------------- pure helpers

def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _day_label(d: date) -> str:
    return f"{d.strftime('%a')} {d.day}"


def _long_day(d: date) -> str:
    return f"{d.strftime('%A')}, {d.day} {d.strftime('%b')}"


def _clock(dt: datetime) -> str:
    hour = dt.hour % 12 or 12
    return f"{hour}:{dt.minute:02d} {'AM' if dt.hour < 12 else 'PM'}"


def week_context(now: datetime, real_now: Optional[datetime] = None) -> dict:
    """The Monday-Friday week containing `now` (IST), as the Planning page needs it."""
    today = now.astimezone(IST)
    # Looking at an earlier day: there is no "now" line, and the page says so.
    past = bool(real_now) and today.date() < real_now.astimezone(IST).date()
    monday = today.date() - timedelta(days=today.weekday())
    days = [monday + timedelta(days=i) for i in range(5)]
    friday = days[-1]
    return {
        "monday": monday,
        "ctx": {
            "date": today.date().isoformat(),
            "days": [_day_label(d) for d in days],
            "today": min(today.weekday(), 4),
            "now": round(today.hour + today.minute / 60, 2),
            "hours_per_day": DAY_END - DAY_START,
            "week_label": (
                f"{_day_label(monday)} – {_day_label(friday)} {friday.strftime('%b')}"
            ),
            "today_label": _long_day(today.date()),
            "holiday": holiday_name(today.date()),
            "past": past,
        },
    }


def est_hours(item: dict) -> float:
    minutes = item.get("est_minutes")
    if not isinstance(minutes, (int, float)) or minutes <= 0:
        minutes = DEFAULT_ESTIMATE_MINUTES
    return round(minutes / 60, 2)


def ago_text(created_at: Optional[str], now: datetime) -> str:
    created = _parse_dt(created_at)
    if not created:
        return ""
    seconds = max(0, int((now - created).total_seconds()))
    if seconds < 90:
        return "just now"
    if seconds < 3600:
        return f"{seconds // 60} min ago"
    if seconds < 86400:
        return f"{seconds // 3600}h ago"
    days = seconds // 86400
    return f"{days} day{'s' if days != 1 else ''} ago"


def due_view(due_at: Optional[str], now: datetime) -> dict:
    due = _parse_dt(due_at)
    if not due:
        return {"due": "", "dueIn": "", "dueTone": "ok"}
    due = due.astimezone(IST)
    now_ist = now.astimezone(IST)
    day = "Today" if due.date() == now_ist.date() else f"{due.strftime('%a')} {due.day} {due.strftime('%b')}"
    hours = (due - now_ist).total_seconds() / 3600
    if hours < 0:
        due_in, tone = "overdue", "urgent"
    elif hours < 24:
        due_in, tone = f"in {max(1, int(hours + 0.5))}h", "urgent" if hours < 4 else "soon"
    else:
        days = int(hours // 24)
        due_in, tone = f"in {days} day{'s' if days != 1 else ''}", "soon" if days < 2 else "ok"
    return {"due": f"{day} · {_clock(due)}", "dueIn": due_in, "dueTone": tone}


def brief_text(item: dict) -> str:
    parts = [f"{p}." for p in (item.get("action"), item.get("notes"), item.get("slot")) if p]
    if parts:
        return " ".join(parts)
    team = (item.get("team") or "").capitalize()
    return f"From the {team + ' ' if team else ''}tasklist: {item.get('raw_line') or ''}".strip()


def task_title(item: dict) -> str:
    """What a task is called on the Gantt and in lists. The deliverable chosen in
    PMT (the dropdown) wins; the free-text "Deliverable Name" is only a last
    resort, because it is whatever somebody typed ("AV") and says little."""
    return (
        item.get("deliverable_label")
        or item.get("db_deliverable")
        or item.get("deliverable_name")
        or item.get("project_text")
        or item.get("raw_line")
        or "Task"
    )


UNMATCHED_DELIVERABLE = "Unmatched"
UNDECIDED_DELIVERABLE_TYPE = "Undecided"


def plan_deliverable(item: dict) -> str:
    """The PMT deliverable a task is tied to, for the Planning card. Only a real
    PMT deliverable counts (the dropdown one); words typed in the tasklist that
    matched nothing are "Unmatched", not a deliverable."""
    return (item.get("db_deliverable") or "").strip() or UNMATCHED_DELIVERABLE


def plan_deliverable_type(item: dict) -> str:
    """The deliverable type for the Planning card: the matched PMT deliverable's
    own type, else the listener's reading of the line, else "Undecided"."""
    return (
        (item.get("db_deliverable_type") or item.get("deliverable_type") or "").strip()
        or UNDECIDED_DELIVERABLE_TYPE
    )


def plan_status(item: dict, work_status: Optional[str]) -> str:
    if item.get("status") == "accepted" and work_status:
        if work_status in WORK_ITEM_DONE:
            return "done"
        if work_status in WORK_ITEM_ACTIVE:
            return "wip"
    return "todo"


SHEET_SOURCE = "worksheet"


def is_plannable_sheet_row(row: dict) -> bool:
    """A Work Sheet row somebody filled in by hand that says what the work is.
    Blank rows (added in bulk, or still being typed), scrapped work and rows
    nobody owns say nothing about the plan."""
    if row.get("status") == "Scrap" or not row.get("creator_id"):
        return False
    try:
        date.fromisoformat(str(row.get("work_date") or ""))
    except ValueError:
        return False
    return bool(
        (row.get("deliverable_name") or "").strip()
        or row.get("deliverable_id")
        or row.get("project_id")
        or row.get("deliverable_type")
    )


def sheet_rows_as_items(
    rows: List[dict],
    names: Dict[str, str],
    project_names: Dict[str, str],
    deliverable_names: Optional[Dict[str, str]] = None,
) -> tuple:
    """Work Sheet rows -> (items, work_status) in the shape build_plan_rows reads
    for WhatsApp tasks, so a row typed straight into the sheet lands on the same
    Gantt and workload maths. Its Work Sheet status is its plan status (Closed is
    done, Ongoing / Ready for Review / ... is in progress, Not Started is to do)
    and the time logged on it is its estimate."""
    items, statuses = [], {}
    for row in rows:
        if not is_plannable_sheet_row(row):
            continue
        minutes = row.get("time_taken_minutes")
        items.append({
            "id": row["id"],
            "source": SHEET_SOURCE,
            "status": "accepted",
            "work_item_id": row["id"],
            "assignee_pmt_name": names.get(row["creator_id"], ""),
            # the dropdown deliverable, else its type; the typed name is a last resort
            "deliverable_label": (deliverable_names or {}).get(row.get("deliverable_id") or "")
            or row.get("deliverable_type")
            or "",
            "db_deliverable": (deliverable_names or {}).get(row.get("deliverable_id") or "") or "",
            "deliverable_name": (row.get("deliverable_name") or "").strip(),
            "deliverable_id": row.get("deliverable_id"),
            "deliverable_type": row.get("deliverable_type") or "",
            "project_name": project_names.get(row.get("project_id") or "", ""),
            "work_date": row["work_date"],
            "created_at": row.get("created_at"),
            "est_minutes": minutes if isinstance(minutes, (int, float)) and minutes > 0 else None,
            "seq": 0,
        })
        statuses[row["id"]] = row.get("status") or ""
    return items, statuses


def resolve_work_status(ids: List[str], found: Dict[str, str]) -> Dict[str, str]:
    """Work Sheet status for each task's row. A row that no longer exists counts
    as done (MISSING_ROW_STATUS), so its task is not rolled forward as late."""
    return {i: found[i] if i in found else MISSING_ROW_STATUS for i in ids}


def build_plan_rows(items: List[dict], work_status: Dict[str, str], now: datetime) -> List[dict]:
    """tasklist_items (and Work Sheet rows, via sheet_rows_as_items) -> the rows
    the Planning screen's maths expects (lib/planning/planningLogic.js taskFromRow)."""
    week = week_context(now)
    monday: date = week["monday"]
    today_iso = week["ctx"]["date"]
    today_idx = week["ctx"]["today"]

    def idx(day: str) -> int:
        return max(0, min(4, (date.fromisoformat(day) - monday).days))

    rows = []
    for item in items:
        from_sheet = item.get("source") == SHEET_SOURCE
        verb = "Logged" if from_sheet else "Assigned"
        work_date = item.get("work_date") or today_iso
        status = plan_status(item, work_status.get(item.get("work_item_id") or ""))
        # A Work Sheet row and a WhatsApp task are the same thing here, so the
        # same rule decides both: anything not closed whose day has passed is
        # carried forward to today as late. Closing the row (status Closed)
        # makes it "done" and it stays on its own day, marked complete. The hours
        # are spread over the days it spans, so a carried row is not counted
        # again in full on every day.
        rolled = status != "done" and work_date < today_iso
        created = _parse_dt(item.get("created_at"))
        created_day = created.astimezone(IST).date().isoformat() if created else None

        if rolled:
            cat = "rolled"
            d0, d1 = idx(work_date), today_idx
            late = (date.fromisoformat(today_iso) - date.fromisoformat(work_date)).days
            note = f"From {_day_label(date.fromisoformat(work_date))} · {late}d late"
        else:
            d0 = d1 = idx(work_date)
            # Assignment only happens through WhatsApp ("new" = assigned). Anything
            # a person adds to the Work Sheet themselves is extra work on top of
            # it ("planned" = extra), whenever it was added.
            cat = "planned" if from_sheet else "new"
            if created_day == work_date == today_iso:
                note = f"{verb} today"
            else:
                note = (
                    f"{verb} " + (_day_label(created.astimezone(IST).date()) if created else _day_label(date.fromisoformat(work_date)))
                )
        # Work waiting on someone else is not "late", it is stuck: finished and
        # sent for review, or sent back with changes. These win over "rolled over"
        # so a delay chart is only about work that is still the person's to do.
        sheet_status = work_status.get(item.get("work_item_id") or "") if item.get("status") == "accepted" else ""
        stuck = (
            "review" if sheet_status == "Ready for Review"
            else "changes" if sheet_status in WORK_ITEM_SENT_BACK
            else None
        )
        if stuck:
            cat = stuck
            since = f" · since {_day_label(date.fromisoformat(work_date))}" if rolled else ""
            note = ("Waiting for review" if stuck == "review" else "Changes requested") + since
        if item.get("plan_note"):
            note = item["plan_note"]
        if item.get("status") == "pending":
            note += " · not accepted yet"

        rows.append({
            "id": item["id"],
            "who": item.get("assignee_pmt_name") or item.get("assignee_name") or "",
            "task": task_title(item),
            "deliverable": plan_deliverable(item),
            "deliverable_type": plan_deliverable_type(item),
            "proj": item.get("project_name") or item.get("project_text") or ("Project to be confirmed" if item.get("project_unconfirmed") else ""),
            "d0": d0,
            "d1": d1,
            "est": est_hours(item),
            "cat": cat,
            "note": note,
            "sh": DAY_START,
            "status": status,
            # Only on rows that came from the Work Sheet: they belong to the
            # person who logged them, so the Planning page cannot reassign them.
            **({"src": SHEET_SOURCE} if from_sheet else {}),
            "_order": (item.get("created_at") or "", item.get("seq") or 0),
        })

    # Today's bars are stacked one after another from the start of the day.
    by_person: Dict[str, List[dict]] = {}
    for row in rows:
        if row["d0"] <= today_idx <= row["d1"]:
            by_person.setdefault(row["who"], []).append(row)
    for person_rows in by_person.values():
        cursor = DAY_START
        for row in sorted(person_rows, key=lambda r: r["_order"]):
            row["sh"] = round(cursor, 2)
            cursor += row["est"] / (row["d1"] - row["d0"] + 1)

    for row in rows:
        row.pop("_order", None)
    return rows


# --------------------------------------------------------------------- router

def create_planning_router(
    db,
    get_acting_user: Callable[[Request], Awaitable[Any]],
    create_work_item: Callable[..., Awaitable[Any]],
    work_item_create_model: type,
    department_to_stage: Dict[str, str],
    deliverable_type_categories: Dict[str, str],
    upsert_notification: Callable[[dict], Awaitable[None]],
    now_iso: Callable[[], str],
    log_error: Optional[Callable[[str], None]] = None,
    clock: Optional[Callable[[], datetime]] = None,
    create_work_item_for_user_id: Optional[Callable[..., Awaitable[Any]]] = None,
    create_work_item_for_task: Optional[Callable[..., Awaitable[Any]]] = None,
) -> APIRouter:
    router = APIRouter(prefix="/planning", tags=["planning"])
    items = db[ITEMS]
    match_logs = db[LOGS]

    def now() -> datetime:
        return (clock or (lambda: datetime.now(timezone.utc)))()

    # ------------------------------------------------------------ access

    async def production_user(request: Request):
        user = await get_acting_user(request)
        if user.role in ("admin", "hr") or not department_to_stage.get(user.department or ""):
            raise HTTPException(status_code=403, detail="Tasks are assigned to team members only")
        return user

    async def planner(request: Request):
        user = await get_acting_user(request)
        if user.role not in ("admin", "manager"):
            raise HTTPException(status_code=403, detail="Manager or admin access required")
        return user

    def can_see(user, item: dict) -> bool:
        if user.role == "admin":
            return True
        dept = TEAM_DEPARTMENT.get((item.get("team") or "").lower())
        return bool(dept) and dept == user.department

    async def load_item(task_id: str) -> dict:
        item = await items.find_one({"id": task_id}, {"_id": 0})
        if not item:
            raise HTTPException(status_code=404, detail="Task not found")
        return item

    async def work_status_map(item_list: List[dict]) -> Dict[str, str]:
        ids = [i["work_item_id"] for i in item_list if i.get("work_item_id")]
        if not ids:
            return {}
        rows = await db.work_items.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "status": 1}
        ).to_list(len(ids))
        found = {r["id"]: r.get("status") or "" for r in rows}
        # An accepted task whose Work Sheet row has since been deleted (for
        # example cleared and re-entered as a dated backfill) has nothing left to
        # do. Without this it looked unstarted for ever and was rolled forward
        # onto every later day as late work.
        return resolve_work_status(ids, found)

    async def apply_logged_minutes(item_list: List[dict]) -> None:
        """An accepted task becomes a Work Sheet row, and the time logged on that
        row is the real size of the work. Use it instead of the 60 minute
        default so the planned hours match what the sheet adds up to."""
        wanted = {
            i["work_item_id"]: i for i in item_list
            if i.get("status") == "accepted" and i.get("work_item_id") and i.get("source") != SHEET_SOURCE
        }
        if not wanted:
            return
        found = await db.work_items.find(
            {"id": {"$in": list(wanted)}}, {"_id": 0, "id": 1, "time_taken_minutes": 1}
        ).to_list(len(wanted))
        for row in found:
            minutes = row.get("time_taken_minutes")
            if isinstance(minutes, (int, float)) and minutes > 0:
                wanted[row["id"]]["est_minutes"] = minutes

    async def attach_deliverable_info(item_list: List[dict]) -> None:
        """Give each item the name and type of the PMT deliverable it is linked
        to, so the Planning card can show them. The matched deliverable's own
        type wins over the listener's guess (plan_deliverable_type)."""
        ids = list({i["deliverable_id"] for i in item_list if i.get("deliverable_id")})
        if not ids:
            return
        found = {
            d["id"]: d
            for d in await db.deliverables.find(
                {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "type": 1}
            ).to_list(len(ids))
        }
        for item in item_list:
            d = found.get(item.get("deliverable_id") or "")
            if not d:
                continue
            if not item.get("db_deliverable"):
                item["db_deliverable"] = d.get("name") or ""
            if d.get("type"):
                item["db_deliverable_type"] = d["type"]

    async def manual_sheet_items(
        names: Dict[str, str], date_from: str, date_to: str
    ) -> tuple:
        """Work Sheet rows these people filled in by hand between two dates, as
        plan items. Rows made from a WhatsApp task (source_task_id) are left out:
        the task itself already stands for them."""
        if not names:
            return [], {}
        rows = await db.work_items.find(
            {
                "creator_id": {"$in": list(names)},
                "work_date": {"$gte": date_from, "$lte": date_to},
                "source_task_id": {"$in": [None, ""]},
                "status": {"$ne": "Scrap"},
            },
            {
                "_id": 0, "id": 1, "creator_id": 1, "status": 1, "work_date": 1, "created_at": 1,
                "deliverable_name": 1, "deliverable_type": 1, "deliverable_id": 1,
                "project_id": 1, "time_taken_minutes": 1,
            },
        ).to_list(5000)
        rows = [r for r in rows if is_plannable_sheet_row(r)]
        project_ids = list({r["project_id"] for r in rows if r.get("project_id")})
        project_names: Dict[str, str] = {}
        if project_ids:
            project_names = {
                p["id"]: p.get("name") or ""
                for p in await db.projects.find(
                    {"id": {"$in": project_ids}}, {"_id": 0, "id": 1, "name": 1}
                ).to_list(len(project_ids))
            }
        deliverable_ids = list({r["deliverable_id"] for r in rows if r.get("deliverable_id")})
        deliverable_names: Dict[str, str] = {}
        if deliverable_ids:
            deliverable_names = {
                d["id"]: d.get("name") or ""
                for d in await db.deliverables.find(
                    {"id": {"$in": deliverable_ids}}, {"_id": 0, "id": 1, "name": 1}
                ).to_list(len(deliverable_ids))
            }
        return sheet_rows_as_items(rows, names, project_names, deliverable_names)

    def history(by: str, action: str, detail: str = "") -> dict:
        return {"at": now_iso(), "by": by, "action": action, "detail": detail}

    async def notify(item: dict, actor, kind: str, title: str, message: str, unique: str):
        """Tell whoever assigned the task (or, when that person is not a PMT
        user, the managers of the team). Never fails the request."""
        try:
            recipients = []
            if item.get("assigned_by_user_id"):
                recipients = [item["assigned_by_user_id"]]
            else:
                dept = TEAM_DEPARTMENT.get((item.get("team") or "").lower())
                if dept:
                    rows = await db.users.find(
                        {"role": "manager", "department": dept, "active": {"$ne": False}},
                        {"_id": 0, "id": 1},
                    ).to_list(50)
                    recipients = [r["id"] for r in rows]
            for user_id in recipients:
                if user_id == actor.id:
                    continue
                await upsert_notification({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "type": kind,
                    "title": title,
                    "message": message,
                    "project_id": item.get("project_id"),
                    "deliverable_id": item.get("deliverable_id"),
                    "deliverable_name": item.get("deliverable_name") or "",
                    "client_id": item.get("client_id"),
                    "stage": None,
                    "action_type": None,
                    "created_at": now_iso(),
                    "read_at": None,
                    "actioned_at": None,
                    "dedupe_key": f"{kind}:{item['id']}:{user_id}:{unique}",
                })
        except Exception as exc:  # noqa: BLE001
            if log_error:
                log_error(f"planning: could not send {kind} notification: {exc}")

    async def log_human(item: dict, outcome: str, actor, extra: Optional[dict] = None):
        """Put the manager's decision next to the NLP's own scores."""
        try:
            await match_logs.update_one(
                {"message_id": item.get("message_id"), "seq": item.get("seq")},
                {"$set": {"human_resolution": {
                    "outcome": outcome,
                    "by": actor.id,
                    "at": now_iso(),
                    **(extra or {}),
                }}},
            )
        except Exception as exc:  # noqa: BLE001
            if log_error:
                log_error(f"planning: could not update nlp_match_logs: {exc}")

    async def production_target(user_id: str, department: Optional[str]) -> dict:
        target = await db.users.find_one({"id": user_id}, {"_id": 0})
        if (
            not target
            or target.get("active") is False
            or target.get("role") not in ("member", "manager")
            or not department_to_stage.get(target.get("department") or "")
        ):
            raise HTTPException(status_code=400, detail="That person cannot be assigned work")
        if department and target.get("department") != department:
            raise HTTPException(
                status_code=400,
                detail=f"That person is not in the {department} team",
            )
        return target

    # ------------------------------------------------- team member: cards

    @router.get("/my-tasks")
    async def my_tasks(request: Request):
        user = await production_user(request)
        current = now()
        today = current.astimezone(IST).date().isoformat()

        pending = await items.find(
            {"assignee_user_id": user.id, "status": "pending"}, {"_id": 0}
        ).to_list(200)
        # High priority first, then oldest first (the order they were posted).
        pending.sort(key=lambda i: (
            0 if str(i.get("priority") or "").lower() in ("high", "urgent") else 1,
            i.get("created_at") or "",
            i.get("seq") or 0,
        ))

        planned = await items.find(
            {"assignee_user_id": user.id, "status": "accepted", "work_date": today}, {"_id": 0}
        ).to_list(200)
        await apply_logged_minutes(planned)
        statuses = await work_status_map(planned)
        load = sum(
            est_hours(i) for i in planned
            if statuses.get(i.get("work_item_id") or "") not in WORK_ITEM_DONE
        )
        # Work they typed into their own Work Sheet for today is load too.
        sheet_items, sheet_statuses = await manual_sheet_items({user.id: user.name}, today, today)
        load += sum(
            est_hours(i) for i in sheet_items
            if sheet_statuses.get(i["id"]) not in WORK_ITEM_DONE
        )
        load = round(load, 2)

        cards = []
        for item in pending:
            cards.append({
                "id": item["id"],
                "from": item.get("assigned_by_name") or "Your manager",
                "role": item.get("assigned_by_role") or "",
                "ago": ago_text(item.get("created_at"), current),
                "pri": "P1" if str(item.get("priority") or "").lower() in ("high", "urgent") else "P2",
                "task": task_title(item),
                "proj": item.get("project_name") or item.get("project_text") or ("Project to be confirmed" if item.get("project_unconfirmed") else ""),
                "client": item.get("client_name") or "",
                "est": est_hours(item),
                "qty": item.get("qty_text") or "—",
                "note": brief_text(item),
                "load": load,
                **due_view(item.get("due_at"), current),
            })
        return cards

    async def ensure_work_item(item: dict, user, request: Optional[Request]) -> str:
        """The member's Work Sheet row for this task, made through the same
        create_work_item() the Work Sheet uses so every rule applies. With no
        request (the auto-accept job) the row is made as that user directly."""
        existing = await db.work_items.find_one(
            {"source_task_id": item["id"]}, {"_id": 0, "id": 1}
        )
        if existing:
            return existing["id"]

        # The manager named the client but the project is not in PMT yet: the Work
        # Sheet row is made without a project and the member picks it there.
        no_project_yet = bool(item.get("project_unconfirmed")) and not item.get("project_id")

        project = (
            None
            if no_project_yet
            else await db.projects.find_one({"id": item.get("project_id")}, {"_id": 0})
        )
        if no_project_yet:
            pass
        elif (
            not project
            or project.get("hidden")
            or project.get("duplicate_of")
            or (item.get("client_id") and project.get("client_id") != item.get("client_id"))
        ):
            raise HTTPException(
                status_code=409,
                detail="This task's project is no longer available. Ask your manager to re-assign it.",
            )

        deliverable = None
        if item.get("deliverable_id") and project:
            deliverable = await db.deliverables.find_one(
                {"id": item["deliverable_id"], "project_id": project["id"]}, {"_id": 0}
            )

        title = task_title(item)
        # The matched deliverable's own type wins. With no deliverable of that name
        # in PMT yet (an article title from a tasklist), the listener's reading of
        # the line's closing word ("... > Carousel") fills the type, so the Work
        # Sheet row still gets its type, category and time per unit.
        d_type = (
            (deliverable or {}).get("type")
            or (None if deliverable else item.get("deliverable_type"))
            or ""
        )
        remarks = f"WhatsApp task from {item.get('assigned_by_name') or 'your manager'}: {item.get('raw_line') or title}"

        payload = work_item_create_model(
            work_date=now().astimezone(IST).date().isoformat(),
            # "Deliverable Name" is never filled: the deliverable dropdown says it
            deliverable_name="",
            deliverable_type=d_type,
            work_category=deliverable_type_categories.get(d_type, "Core"),
            creator_id=user.id,
            client_id=project.get("client_id") if project else item.get("client_id"),
            project_id=project["id"] if project else None,
            deliverable_id=(deliverable or {}).get("id"),
            # A deliverable the project does not have yet is the Work Sheet's
            # own "Not available" case (admins are told to add it).
            deliverable_not_available=bool(project and item.get("deliverable_name") and not deliverable),
            stage=department_to_stage[user.department],
            remarks=remarks,
            status="Not Started",
        )
        if create_work_item_for_task is not None:
            # source_task_id is part of the insert itself (and unique), so there
            # is no window where the row exists without it.
            created = await create_work_item_for_task(user.id, payload, item["id"])
        else:
            if request is not None:
                created = await create_work_item(payload, request)
            else:
                created = await create_work_item_for_user_id(user.id, payload)
            await db.work_items.update_one(
                {"id": created.id},
                {"$set": {"source": "whatsapp_task", "source_task_id": item["id"]}},
            )
        return created.id

    @router.post("/my-tasks/{task_id}/accept")
    async def accept_task(task_id: str, request: Request):
        user = await production_user(request)
        item = await load_item(task_id)
        if item.get("assignee_user_id") != user.id:
            raise HTTPException(status_code=404, detail="Task not found")

        if item["status"] == "accepted":
            return {"ok": True, "work_item_id": item.get("work_item_id"), "already_accepted": True}
        if item["status"] not in ("pending", "accepting"):
            raise HTTPException(status_code=409, detail=f"This task is {item['status']}, not waiting for you")

        stamp = now_iso()
        if item["status"] == "pending":
            claim = await items.update_one(
                {"id": task_id, "status": "pending"},
                {"$set": {"status": "accepting", "accepting_at": stamp}},
            )
        else:
            # Another request holds the claim, unless it crashed long ago.
            started = _parse_dt(item.get("accepting_at"))
            if started and (now() - started).total_seconds() < CLAIM_STALE_SECONDS:
                raise HTTPException(status_code=409, detail="This task is already being accepted")
            claim = await items.update_one(
                {"id": task_id, "status": "accepting", "accepting_at": item.get("accepting_at")},
                {"$set": {"accepting_at": stamp}},
            )
        if claim.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task was just changed. Reload and try again.")

        try:
            work_item_id = await ensure_work_item(item, user, request)
        except Exception:
            await items.update_one(
                {"id": task_id, "status": "accepting"}, {"$set": {"status": "pending"}}
            )
            raise

        await items.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": "accepted",
                    "work_item_id": work_item_id,
                    "accepted_at": now_iso(),
                    "updated_at": now_iso(),
                },
                "$push": {"history": history(user.id, "accepted", f"work item {work_item_id}")},
            },
        )
        return {"ok": True, "work_item_id": work_item_id}

    @router.post("/my-tasks/{task_id}/decline")
    async def decline_task(task_id: str, payload: DeclinePayload, request: Request):
        user = await production_user(request)
        reason = (payload.reason or "").strip()
        if not reason:
            raise HTTPException(status_code=400, detail="Choose a reason first")
        item = await load_item(task_id)
        if item.get("assignee_user_id") != user.id:
            raise HTTPException(status_code=404, detail="Task not found")

        message = (payload.message or "").strip()[:1000]
        result = await items.update_one(
            {"id": task_id, "status": "pending"},
            {
                "$set": {
                    "status": "declined",
                    "declined_at": now_iso(),
                    "decline_reason": reason[:200],
                    "decline_message": message,
                    "updated_at": now_iso(),
                },
                "$push": {"history": history(user.id, "declined", reason[:200])},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task can no longer be declined")

        await notify(
            item, user, "task_declined", "Task declined",
            f"{user.name} declined “{task_title(item)}”: {reason}" + (f" — {message}" if message else ""),
            "declined",
        )
        return {"ok": True}

    @router.post("/my-tasks/{task_id}/ask")
    async def ask_about_task(task_id: str, payload: AskPayload, request: Request):
        user = await production_user(request)
        text = (payload.message or "").strip()
        if not text:
            raise HTTPException(status_code=400, detail="Type your question first")
        item = await load_item(task_id)
        if item.get("assignee_user_id") != user.id:
            raise HTTPException(status_code=404, detail="Task not found")

        result = await items.update_one(
            {"id": task_id, "status": "pending"},
            {
                "$push": {
                    "questions": {"at": now_iso(), "by": user.id, "text": text[:1000]},
                    "history": history(user.id, "question", text[:200]),
                },
                "$set": {"updated_at": now_iso()},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task is no longer waiting for you")

        await notify(
            item, user, "task_question", "Question about a task",
            f"{user.name} asked about “{task_title(item)}”: {text[:300]}",
            uuid.uuid4().hex,
        )
        return {"ok": True}

    # ------------------------------------------------ auto-accept after 1 hour

    def pending_since(item: dict) -> Optional[datetime]:
        """When the card became visible to the assignee."""
        for field in ("released_at", "resolved_at", "created_at"):
            moment = _parse_dt(item.get(field))
            if moment:
                return moment
        return None

    async def auto_accept_one(item: dict, current: datetime) -> bool:
        """Accept one task for its assignee, exactly as the Accept button would
        (same claim, same Work Sheet rules, one row even if the person clicks
        at the same moment). A refusal leaves the task pending on their card."""
        task_id = item["id"]
        doc = await db.users.find_one({"id": item["assignee_user_id"]}, {"_id": 0})
        if (
            not doc
            or doc.get("active") is False
            or doc.get("role") in ("admin", "hr")
            or not department_to_stage.get(doc.get("department") or "")
        ):
            return False
        user = SimpleNamespace(
            id=doc["id"], name=doc.get("name") or "", role=doc.get("role"),
            department=doc.get("department"),
        )

        claim = await items.update_one(
            {"id": task_id, "status": "pending"},
            {"$set": {"status": "accepting", "accepting_at": now_iso()}},
        )
        if claim.modified_count != 1:
            return False  # the person accepted, declined or was reassigned just now

        try:
            work_item_id = await ensure_work_item(item, user, None)
        except Exception as exc:  # noqa: BLE001
            detail = getattr(exc, "detail", None) or str(exc)
            await items.update_one(
                {"id": task_id, "status": "accepting"},
                {"$set": {
                    "status": "pending",
                    "auto_accept_failed_at": now_iso(),
                    "auto_accept_error": str(detail)[:300],
                }},
            )
            if log_error:
                log_error(f"planning: auto-accept of task {task_id} failed: {detail}")
            return False

        stamp = now_iso()
        await items.update_one(
            {"id": task_id},
            {
                "$set": {
                    "status": "accepted",
                    "work_item_id": work_item_id,
                    "accepted_at": stamp,
                    "auto_accepted": True,
                    "updated_at": stamp,
                },
                "$push": {"history": history(
                    "system", "auto_accepted",
                    f"not answered within {AUTO_ACCEPT_AFTER_MINUTES:g} min; work item {work_item_id}",
                )},
            },
        )
        return True

    async def auto_accept_due() -> int:
        """Accept every task card that has sat unanswered for the whole window.
        Returns how many were accepted. Only today's tasks are touched: a task
        from an earlier day was never accepted and must not reappear as a row
        dated today."""
        if AUTO_ACCEPT_AFTER_MINUTES <= 0 or create_work_item_for_user_id is None:
            return 0

        current = now()
        today = current.astimezone(IST).date().isoformat()
        cutoff = current - timedelta(minutes=AUTO_ACCEPT_AFTER_MINUTES)
        retry_after = timedelta(minutes=AUTO_ACCEPT_RETRY_MINUTES)

        rows = await items.find(
            {
                "status": "pending",
                "work_date": today,
                "assignee_user_id": {"$nin": [None, ""]},
            },
            {"_id": 0},
        ).to_list(500)

        accepted = 0
        for item in rows:
            since = pending_since(item)
            if not since or since > cutoff:
                continue
            failed = _parse_dt(item.get("auto_accept_failed_at"))
            if failed and current - failed < retry_after:
                continue
            if await auto_accept_one(item, current):
                accepted += 1
        return accepted

    router.auto_accept_due = auto_accept_due  # run by server.py's background loop

    # ------------------------------------------------ managers: Planning

    @router.get("/overview")
    async def overview(request: Request, date: Optional[str] = Query(None)):
        """The plan as of `date` (YYYY-MM-DD, IST); today when omitted. An earlier
        day shows that day's Gantt: Work Sheet rows by the date they were logged,
        tasks as they stood on it (a task since reassigned or declined is not
        reconstructed)."""
        user = await planner(request)
        real_now = now()
        current = real_now
        if date:
            try:
                picked = date_type.fromisoformat(date)
            except ValueError:
                raise HTTPException(status_code=400, detail="date must look like 2026-10-09")
            if picked < real_now.astimezone(IST).date():
                current = datetime(picked.year, picked.month, picked.day, 12, 0, tzinfo=IST)
        week = week_context(current, real_now)
        monday: date = week["monday"]

        query: Dict[str, Any] = {
            "status": {"$in": list(OPEN_STATUSES)},
            "work_date": {
                "$gte": (monday - timedelta(days=14)).isoformat(),
                "$lte": (monday + timedelta(days=6)).isoformat(),
            },
        }
        if user.role == "manager":
            query["team"] = {"$in": [t for t, d in TEAM_DEPARTMENT.items() if d == user.department]}
        people_query: Dict[str, Any] = {
            "active": {"$ne": False},
            "role": {"$in": ["member", "manager"]},
            "department": {"$in": [user.department] if user.role == "manager" else list(PLAN_DEPARTMENTS)},
        }
        # The tasks and the people don't depend on each other: fetch them at once.
        rows, people_rows = await asyncio.gather(
            items.find(query, {"_id": 0}).to_list(2000),
            db.users.find(
                people_query, {"_id": 0, "id": 1, "name": 1, "department": 1, "username": 1}
            ).to_list(500),
        )
        people = [
            {"id": p["id"], "name": p["name"], "dept": p["department"]}
            for p in people_rows
            if not TEST_ACCOUNT.search(f"{p['name']} {p.get('username') or ''}")
        ]

        # The other way of filling the Work Sheet: rows people typed in
        # themselves (no WhatsApp task behind them) are plan too. They go through
        # the same maths, so they land on the Gantt and in everyone's workload.
        # Looked up alongside the work-status and logged-time lookups for the
        # WhatsApp tasks, which only need the task rows.
        (sheet_items, sheet_statuses), statuses, _ = await asyncio.gather(
            manual_sheet_items(
                {p["id"]: p["name"] for p in people},
                (monday - timedelta(days=14)).isoformat(),
                (monday + timedelta(days=6)).isoformat(),
            ),
            work_status_map(rows),
            apply_logged_minutes(rows),
        )
        rows = rows + sheet_items
        statuses = {**statuses, **sheet_statuses}
        await attach_deliverable_info(rows)

        week_start = monday.isoformat()
        rows = [
            r for r in rows
            # finished work from before this week is history, not plan. That is
            # true of a WhatsApp task and a Work Sheet row alike; one that is
            # still open stays and is carried forward as late.
            if not (
                (r.get("work_date") or "") < week_start
                and plan_status(r, statuses.get(r.get("work_item_id") or "")) == "done"
            )
        ]
        tasks = build_plan_rows(rows, statuses, current)
        return {"ctx": week["ctx"], "tasks": tasks, "people": people}

    @router.post("/tasks/{task_id}/reassign")
    async def reassign_task(task_id: str, payload: ReassignPayload, request: Request):
        user = await planner(request)
        item = await load_item(task_id)
        if not can_see(user, item):
            raise HTTPException(status_code=404, detail="Task not found")
        if item["status"] not in ("pending", "declined"):
            raise HTTPException(
                status_code=409,
                detail="This task is already " + ("in the person's Work Sheet" if item["status"] == "accepted" else item["status"]) + " and cannot be moved.",
            )

        dept = TEAM_DEPARTMENT.get((item.get("team") or "").lower())
        target = await production_target(payload.to_user_id, dept)
        before = item.get("assignee_pmt_name") or item.get("assignee_name") or "someone"

        result = await items.update_one(
            {"id": task_id, "status": item["status"]},
            {
                "$set": {
                    "status": "pending",
                    "assignee_user_id": target["id"],
                    "assignee_pmt_name": target["name"],
                    "assignee_name": target["name"].split()[0],
                    "plan_note": f"Reassigned from {before.split()[0]}",
                    "declined_at": None,
                    "decline_reason": None,
                    # the new assignee gets the full window to answer
                    "released_at": now_iso(),
                    "auto_accept_failed_at": None,
                    "updated_at": now_iso(),
                },
                "$push": {"history": history(user.id, "reassigned", f"{before} -> {target['name']}")},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task was just changed. Reload and try again.")
        return {"ok": True}

    # ---------------------------------------------- managers: review queue

    @router.get("/review")
    async def review_queue(request: Request, status: str = Query(default="needs_review")):
        user = await planner(request)
        if status not in ("needs_review", "declined"):
            raise HTTPException(status_code=400, detail="status must be needs_review or declined")
        query: Dict[str, Any] = {"status": status}
        if user.role == "manager":
            query["team"] = {"$in": [t for t, d in TEAM_DEPARTMENT.items() if d == user.department]}
        rows = await items.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)
        keep = (
            "id", "status", "work_date", "team", "assignee_name", "assignee_user_id",
            "assignee_pmt_name", "raw_line", "client_id", "client_name", "project_id",
            "project_name", "project_text", "deliverable_name", "deliverable_id",
            "priority", "confidence", "alternatives", "review_reasons", "nlp_ids",
            "decline_reason", "decline_message", "questions", "assigned_by_name",
            "created_at",
        )
        return [{k: r.get(k) for k in keep} for r in rows]

    @router.post("/review/{task_id}/resolve")
    async def resolve(task_id: str, payload: ResolvePayload, request: Request):
        user = await planner(request)
        item = await load_item(task_id)
        if not can_see(user, item):
            raise HTTPException(status_code=404, detail="Task not found")
        if item["status"] != "needs_review":
            raise HTTPException(status_code=409, detail="This task is not waiting for review")

        project = await db.projects.find_one({"id": payload.project_id}, {"_id": 0})
        if not project or project.get("hidden") or project.get("duplicate_of"):
            raise HTTPException(status_code=400, detail="That project is not available")
        client = await db.clients.find_one({"id": project.get("client_id")}, {"_id": 0, "id": 1, "name": 1})
        if not client:
            raise HTTPException(status_code=400, detail="That project has no valid client")

        deliverable = None
        if payload.deliverable_id:
            deliverable = await db.deliverables.find_one(
                {"id": payload.deliverable_id, "project_id": project["id"]}, {"_id": 0}
            )
            if not deliverable:
                raise HTTPException(status_code=400, detail="That deliverable does not belong to the project")

        dept = TEAM_DEPARTMENT.get((item.get("team") or "").lower())
        assignee_id = payload.assignee_user_id or item.get("assignee_user_id")
        if not assignee_id:
            raise HTTPException(status_code=400, detail="Choose who this task is for")
        target = await production_target(assignee_id, dept)

        nlp_project = (item.get("nlp_ids") or {}).get("project_id")
        outcome = "confirmed_nlp" if nlp_project and nlp_project == project["id"] else "corrected"

        result = await items.update_one(
            {"id": task_id, "status": "needs_review"},
            {
                "$set": {
                    "status": "pending",
                    "needs_review": False,
                    "resolved_reasons": item.get("review_reasons") or [],
                    "review_reasons": [],
                    "client_id": client["id"],
                    "client_name": client.get("name"),
                    "project_id": project["id"],
                    "project_name": project.get("name"),
                    "deliverable_id": (deliverable or {}).get("id"),
                    "db_deliverable": (deliverable or {}).get("name"),
                    "assignee_user_id": target["id"],
                    "assignee_pmt_name": target["name"],
                    "resolved_by": user.id,
                    "resolved_at": now_iso(),
                    "updated_at": now_iso(),
                },
                "$push": {"history": history(user.id, "resolved", f"{outcome}: {project.get('name')}")},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task was just changed. Reload and try again.")
        await log_human(item, outcome, user, {"project_id": project["id"], "deliverable_id": (deliverable or {}).get("id")})
        return {"ok": True, "outcome": outcome}

    @router.post("/review/{task_id}/reject")
    async def reject(task_id: str, payload: RejectPayload, request: Request):
        user = await planner(request)
        item = await load_item(task_id)
        if not can_see(user, item):
            raise HTTPException(status_code=404, detail="Task not found")
        result = await items.update_one(
            {"id": task_id, "status": "needs_review"},
            {
                "$set": {"status": "rejected", "updated_at": now_iso()},
                "$push": {"history": history(user.id, "rejected", (payload.reason or "")[:200])},
            },
        )
        if result.modified_count != 1:
            raise HTTPException(status_code=409, detail="This task is not waiting for review")
        await log_human(item, "rejected", user, {"reason": (payload.reason or "")[:200]})
        return {"ok": True}

    # ------------------------------------------- managers: learned rules

    @router.get("/learned-rules")
    async def learned_rules(request: Request):
        await planner(request)
        rows = await db.nlp_learned_rules.find({}, {"_id": 0}).sort("updated_at", -1).to_list(500)
        project_ids = [r["project_id"] for r in rows if r.get("project_id")]
        client_ids = [r["client_id"] for r in rows if r.get("client_id")]
        names = {
            p["id"]: p.get("name")
            async for p in db.projects.find({"id": {"$in": project_ids}}, {"_id": 0, "id": 1, "name": 1})
        }
        clients = {
            c["id"]: c.get("name")
            async for c in db.clients.find({"id": {"$in": client_ids}}, {"_id": 0, "id": 1, "name": 1})
        }
        return [
            {
                "id": r["id"],
                "kind": r.get("kind"),
                "example": r.get("example") or r.get("key"),
                "project_name": names.get(r.get("project_id")),
                "client_name": clients.get(r.get("client_id")),
                "count": r.get("count", 1),
                "disabled": bool(r.get("disabled")),
            }
            for r in rows
        ]

    @router.post("/learned-rules/disabled")
    async def set_rule_disabled(payload: RuleSwitchPayload, request: Request):
        await planner(request)
        result = await db.nlp_learned_rules.update_one(
            {"id": payload.id}, {"$set": {"disabled": bool(payload.disabled)}}
        )
        if result.matched_count != 1:
            raise HTTPException(status_code=404, detail="Rule not found")
        return {"ok": True}

    return router
