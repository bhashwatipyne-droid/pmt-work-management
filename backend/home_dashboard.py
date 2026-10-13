"""
Home dashboard (admin) — GET /api/dashboard/home?month=YYYY-MM

One request feeds every tab of the Home page. The server does the joins that
need the database (owners, revisions, pending approvals, work-sheet hygiene,
6-month trends); the page does the cheap slicing (team view, client / project /
member / status filters) on the rows it gets back, so switching those is
instant and needs no new request.

Definitions (keep in sync with frontend/src/pages/DashboardPage.jsx):

  due          the deliverable's CURRENT stage deadline
               (stage_schedule[current_stage].end_dt, else the deliverable end_dt)
  final_due    the deliverable's overall deadline (end_dt)
  no deadline  an open deliverable with no stage / deliverable end date uses its
               project's end date; if that is missing too it is reported as
               "unscheduled" instead of being dropped silently
  month scope  due falls in the month, plus anything still not done whose due
               is before the month ("carried over"), however long ago it was due
  upcoming     only when viewing the CURRENT month: open work due after the month's
               end that is not billed / ready for invoice. It is healthy work
               scheduled ahead, so it counts (as on track) instead of vanishing.
  bucket       billed   project Raised Invoice / Completed, or the deliverable
                        itself is Completed
               ready    project Ready for Invoice
               delay    not done and due has passed
               risk     not done, due within AT_RISK_DAYS, not already in review
               on       everything else still active
  next 7 days  not done and final_due within the next 7 days (relative to today,
               not to the month being viewed)
  revisions    times a deliverable was sent back, from all three places that
               record it: approval send-backs, deliverable edits, work-sheet
               reviews
  approvals    per deliverable, its pending approval items (type + the person
               assigned, if any) - who has to sign off
  reviews      work-sheet entries a member marked "Ready for Review" that their
               assigned reviewer has not acted on yet (not for deliverables that are
               already done, or projects already billed / completed). Owner = the member who
               logged it, reviewer = who it is assigned to, since = when it was
               marked ready (no age limit)

team activity  GET /api/dashboard/team-activity - fetched only when the Home page's
               "Team activity" tab is opened, so the other tabs don't pay for it.
               Live, per member (not tied to the month being viewed): minutes logged
               today and this week, the latest work-sheet entry of today ("now") and
               their last few entries. The page combines it with the deliverable rows
               to show who is working, in review, blocked, delayed or not logged.

Scrapped and hidden projects are left out entirely. Deliverables with no
deadline at all can't be placed in a month and are left out of month scope.
"""

import asyncio
import re
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request

AT_RISK_DAYS = 2
CRITICAL_LATE_DAYS = 3
STALE_WORKING_DAYS = 3
NEXT_DAYS = 7

# Team activity. A working day is 8.5h - the same default the Efficiency module
# uses (efficiency.DEFAULT_WORKING_HOURS_PER_DAY) - so "load this week" reads as
# minutes logged so far against the minutes expected so far (Mon..today).
WORKDAY_MINUTES = int(8.5 * 60)
ACTIVITY_DAYS = 14
ACTIVITY_RECENT = 4

BILLED_PROJECT_STATUSES = {"Raised Invoice", "Completed"}
# "Closed" is the legacy finished-import status (see migrate_finished_deliverables.py);
# it means done exactly like "Completed".
DONE_STAGE_STATUSES = {"Completed", "Closed"}
# Same clock the Planning module uses: the team works in IST, so "today" and
# "this month" must roll over at IST midnight, not UTC midnight.
IST = timezone(timedelta(hours=5, minutes=30))
EXCLUDED_PROJECT_STATUSES = {"Scrapped"}


def _day(value) -> Optional[str]:
    """'2026-09-28' from a date / ISO string, or None."""
    if not value:
        return None
    text = str(value)[:10]
    return text if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text) else None


def _month_bounds(month: str):
    year, mon = int(month[:4]), int(month[5:7])
    start = date(year, mon, 1)
    nxt = date(year + (mon == 12), 1 if mon == 12 else mon + 1, 1)
    return start, nxt - timedelta(days=1)


def _prev_months(month: str, count: int) -> List[str]:
    year, mon = int(month[:4]), int(month[5:7])
    out = []
    for _ in range(count):
        out.append(f"{year:04d}-{mon:02d}")
        mon -= 1
        if mon == 0:
            mon, year = 12, year - 1
    return list(reversed(out))


def _working_days_back(today: date, n: int) -> date:
    """The date n working days (Mon–Fri) before today."""
    d = today
    while n > 0:
        d -= timedelta(days=1)
        if d.weekday() < 5:
            n -= 1
    return d


def create_home_dashboard_router(
    db,
    require_admin,
    deliverable_required_for,
    time_gated_statuses,
) -> APIRouter:
    router = APIRouter()

    @router.get("/dashboard/home")
    async def dashboard_home(request: Request, month: Optional[str] = Query(None)):
        await require_admin(request)

        today = datetime.now(IST).date()
        this_month = today.strftime("%Y-%m")
        month = month or this_month
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month):
            raise HTTPException(status_code=400, detail="month must look like 2026-09")
        # Nothing is "due in the future" as far as management is concerned, and
        # a future month would only echo this month's carried-over delays.
        if month > this_month:
            month = this_month

        m_start, m_end = _month_bounds(month)
        trend_months = _prev_months(month, 6)
        window_start, _ = _month_bounds(trend_months[0])
        today_s, m_start_s, m_end_s = today.isoformat(), m_start.isoformat(), m_end.isoformat()
        risk_until = (today + timedelta(days=AT_RISK_DAYS)).isoformat()
        next_until = (today + timedelta(days=NEXT_DAYS)).isoformat()

        (
            projects,
            clients,
            deliverables,
            owner_rows,
            wi_rework_rows,
            d_rework_rows,
            send_back_rows,
            pending_items,
            window_items,
            members,
            last_log_rows,
            review_items,
        ) = await asyncio.gather(
            db.projects.find(
                {}, {"_id": 0, "id": 1, "name": 1, "client_id": 1, "status": 1, "hidden": 1, "end_date": 1}
            ).to_list(None),
            db.clients.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None),
            db.deliverables.find(
                {},
                {
                    "_id": 0, "id": 1, "name": 1, "project_id": 1, "current_stage": 1,
                    "stage_status": 1, "stage_schedule": 1, "end_dt": 1, "updated_at": 1,
                },
            ).to_list(None),
            # Owner = whoever last logged work on this deliverable at its stage.
            db.work_items.aggregate([
                {"$match": {"deliverable_id": {"$nin": [None, ""]}, "creator_id": {"$nin": [None, ""]}}},
                {"$sort": {"work_date": -1, "created_at": -1}},
                {"$group": {
                    "_id": {"d": "$deliverable_id", "s": "$stage"},
                    "creator_id": {"$first": "$creator_id"},
                    "work_date": {"$first": "$work_date"},
                    "created_at": {"$first": "$created_at"},
                }},
            ]).to_list(None),
            db.work_item_activity_log.aggregate([
                {"$match": {"action": "WORK_ITEM_REWORKED"}},
                {"$group": {"_id": "$work_item_id", "n": {"$sum": 1}}},
            ]).to_list(None),
            db.deliverable_activity_log.aggregate([
                {"$match": {"action": "DELIVERABLE_REWORKED"}},
                {"$group": {"_id": "$deliverable_id", "n": {"$sum": 1}}},
            ]).to_list(None),
            db.approval_history.aggregate([
                {"$match": {"action": "CHANGES_REQUESTED"}},
                {"$group": {"_id": "$deliverable_id", "n": {"$sum": 1}}},
            ]).to_list(None),
            db.approval_items.find(
                {"status": "PENDING", "hidden": {"$ne": True}},
                {"_id": 0, "deliverable_id": 1, "requested_at": 1, "assigned_to": 1, "approval_type": 1},
            ).to_list(None),
            db.work_items.find(
                {"work_date": {"$gte": window_start.isoformat(), "$lte": m_end_s}},
                {
                    "_id": 0, "work_date": 1, "status": 1, "project_id": 1, "deliverable_id": 1,
                    "deliverable_not_available": 1, "time_taken_minutes": 1,
                    "work_category": 1, "deliverable_type": 1,
                },
            ).to_list(None),
            db.users.find(
                {"role": {"$in": ["member", "manager"]}, "active": {"$ne": False}},
                {"_id": 0, "id": 1, "name": 1, "department": 1},
            ).to_list(None),
            db.work_items.aggregate([
                {"$match": {"creator_id": {"$nin": [None, ""]}}},
                {"$group": {"_id": "$creator_id", "last": {"$max": "$work_date"}}},
            ]).to_list(None),
            db.work_items.find(
                {"status": "Ready for Review"},
                {
                    "_id": 0, "id": 1, "deliverable_name": 1, "project_id": 1, "deliverable_id": 1,
                    "stage": 1, "creator_id": 1, "reviewer_id": 1, "updated_at": 1, "created_at": 1,
                },
            ).to_list(None),
        )

        marked_ready_at: Dict[str, str] = {}
        if review_items:
            async for row in db.work_item_activity_log.aggregate([
                {"$match": {
                    "action": "WORK_ITEM_STATUS_CHANGED",
                    "new_value": "Ready for Review",
                    "work_item_id": {"$in": [w["id"] for w in review_items]},
                }},
                {"$group": {"_id": "$work_item_id", "at": {"$max": "$changed_at"}}},
            ]):
                marked_ready_at[row["_id"]] = row.get("at")

        # ---- lookups -------------------------------------------------------
        client_name = {c["id"]: c.get("name", "") for c in clients if c.get("id")}
        project_by_id: Dict[str, dict] = {}
        for p in projects:
            if not p.get("id") or p.get("hidden") or p.get("status") in EXCLUDED_PROJECT_STATUSES:
                continue
            project_by_id[p["id"]] = {
                "id": p["id"],
                "name": p.get("name", ""),
                "client_id": p.get("client_id"),
                "client_name": client_name.get(p.get("client_id"), ""),
                "status": p.get("status", ""),
                "end_date": _day(p.get("end_date")),
            }

        # $group output has no defined order, so "latest across stages" is
        # picked here from each group's own latest entry.
        owner = {}
        latest_any_stage = {}
        latest_stamp = {}
        for row in owner_rows:
            key = row.get("_id") or {}
            d_id = key.get("d")
            owner[(d_id, key.get("s"))] = row.get("creator_id")
            stamp = (str(row.get("work_date") or ""), str(row.get("created_at") or ""))
            if d_id not in latest_stamp or stamp > latest_stamp[d_id]:
                latest_stamp[d_id] = stamp
                latest_any_stage[d_id] = row.get("creator_id")

        revisions: Dict[str, int] = {}
        if wi_rework_rows:
            wi_ids = [r["_id"] for r in wi_rework_rows if r.get("_id")]
            wi_to_deliv = {
                w["id"]: w.get("deliverable_id")
                async for w in db.work_items.find(
                    {"id": {"$in": wi_ids}}, {"_id": 0, "id": 1, "deliverable_id": 1}
                )
            }
            for r in wi_rework_rows:
                d_id = wi_to_deliv.get(r.get("_id"))
                if d_id:
                    revisions[d_id] = revisions.get(d_id, 0) + r["n"]
        for rows in (d_rework_rows, send_back_rows):
            for r in rows:
                if r.get("_id"):
                    revisions[r["_id"]] = revisions.get(r["_id"], 0) + r["n"]

        pending_by_deliv: Dict[str, List[dict]] = {}
        for item in pending_items:
            if item.get("deliverable_id"):
                pending_by_deliv.setdefault(item["deliverable_id"], []).append(item)

        # ---- per-deliverable facts ----------------------------------------
        rows_out = []
        trend_due: Dict[str, List[bool]] = {m: [] for m in trend_months}
        trend_first_pass: Dict[str, List[bool]] = {m: [] for m in trend_months}
        unscheduled: List[dict] = []

        for d in deliverables:
            project = project_by_id.get(d.get("project_id"))
            if not project:
                continue

            stage = d.get("current_stage") or "Content"
            stage_status = d.get("stage_status") or "Not Started"
            done = stage_status in DONE_STAGE_STATUSES
            # A deliverable inside an already-invoiced / completed project is
            # finished for delivery purposes even if its own status was never
            # ticked, so it must not count as late in the trend either.
            finished = done or project["status"] in BILLED_PROJECT_STATUSES
            window = (d.get("stage_schedule") or {}).get(stage) or {}
            due = _day(window.get("end_dt")) or _day(d.get("end_dt"))
            # Open work with no deadline of its own inherits its project's end
            # date, so it still lands in a month instead of vanishing.
            if not due and not finished:
                due = project.get("end_date")
            final_due = _day(d.get("end_dt")) or due
            revs = revisions.get(d["id"], 0)
            completed_on = _day(d.get("updated_at")) if done else None

            # Trends: late share of what was due in each month, first-pass
            # share of what finished in each month. "Finished" uses the
            # deliverable's last update as its completion date - the app
            # doesn't store a separate completed-at.
            if due and due[:7] in trend_due:
                late = (done and completed_on and completed_on > due) or (not finished and due < today_s)
                trend_due[due[:7]].append(bool(late))
            if completed_on and completed_on[:7] in trend_first_pass:
                trend_first_pass[completed_on[:7]].append(revs == 0)

            in_month = bool(due) and m_start_s <= due <= m_end_s
            carried = bool(due) and due < m_start_s and not finished
            # Viewing the current month: open work scheduled beyond it is still
            # live work. (Past months stay as they were - nothing "upcoming".)
            upcoming = (
                month == this_month
                and bool(due) and due > m_end_s and not finished
                and project["status"] != "Ready for Invoice"
            )
            scoped = in_month or carried or upcoming

            in_next = (
                not done
                and project["status"] not in BILLED_PROJECT_STATUSES
                and project["status"] != "Ready for Invoice"
                and bool(final_due)
                and today_s <= final_due <= next_until
            )
            if (
                not due and not finished
                and project["status"] not in ("Ready for Invoice",)
                and len(unscheduled) < 200
            ):
                unscheduled.append({"id": d["id"], "name": d.get("name", ""), "project_id": project["id"], "project": project["name"]})
            if not scoped and not in_next:
                continue

            bucket = None
            if scoped:
                if project["status"] in BILLED_PROJECT_STATUSES or done:
                    bucket = "billed"
                elif project["status"] == "Ready for Invoice":
                    bucket = "ready"
                elif due < today_s:
                    bucket = "delay"
                elif due <= risk_until and stage_status != "Ready for Review":
                    bucket = "risk"
                else:
                    bucket = "on"

            next_status = None
            if in_next:
                if due and due < today_s:
                    next_status = "Delayed"
                elif stage_status == "Ready for Review":
                    next_status = "In review"
                elif due and due <= risk_until:
                    next_status = "At risk"
                else:
                    next_status = "On track"

            pending = pending_by_deliv.get(d["id"], [])

            days_late = None
            if due and not done and due < today_s:
                days_late = (today - date.fromisoformat(due)).days

            rows_out.append({
                "id": d["id"],
                "name": d.get("name", ""),
                "project_id": project["id"],
                "stage": stage,
                "stage_status": stage_status,
                "due": due,
                "final_due": final_due,
                "days_late": days_late,
                "bucket": bucket,
                "next_status": next_status,
                "owner_id": owner.get((d["id"], stage)) or latest_any_stage.get(d["id"]),
                "revisions": revs,
                "pending_approvals": len(pending),
                "approvals": [
                    {"type": p.get("approval_type"), "assigned_to": p.get("assigned_to")}
                    for p in pending
                ],
            })

        # ---- work-sheet reviews still waiting on the reviewer ---------------
        # A work-sheet entry still awaiting its reviewer is not actionable once
        # the deliverable it belongs to is finished (or its project is billed),
        # so it must not push the project into "Watch" / the action queue.
        done_deliverables = {
            d["id"] for d in deliverables if d.get("stage_status") in DONE_STAGE_STATUSES
        }
        reviews_out = []
        for w in review_items:
            if w.get("deliverable_id") in done_deliverables:
                continue
            if (project_by_id.get(w.get("project_id")) or {}).get("status") in BILLED_PROJECT_STATUSES:
                continue
            since = marked_ready_at.get(w["id"]) or w.get("updated_at") or w.get("created_at")
            since_day = _day(since)
            project_id = w.get("project_id")
            if not since_day:
                continue
            if project_id and project_id not in project_by_id:
                continue
            reviews_out.append({
                "id": w["id"],
                "name": w.get("deliverable_name") or "Untitled work item",
                "project_id": project_id,
                "deliverable_id": w.get("deliverable_id"),
                "stage": w.get("stage"),
                "owner_id": w.get("creator_id"),
                "reviewer_id": w.get("reviewer_id"),
                "since": since,
            })

        # ---- work-sheet hygiene ("PMT discipline") -------------------------
        discipline: Dict[str, List[bool]] = {m: [] for m in trend_months}
        for w in window_items:
            m = (w.get("work_date") or "")[:7]
            if m not in discipline:
                continue
            missing_deliverable = (
                deliverable_required_for(w)
                and not w.get("deliverable_id")
                and not w.get("deliverable_not_available")
            )
            try:
                minutes = float(w.get("time_taken_minutes") or 0)
            except (TypeError, ValueError):
                minutes = 0
            missing_time = w.get("status") in time_gated_statuses and minutes <= 0
            discipline[m].append(not (missing_deliverable or missing_time))

        def pct(values: List[bool]) -> Optional[int]:
            return round(100 * sum(values) / len(values)) if values else None

        trend = [
            {
                "month": m,
                "delay_rate": pct(trend_due[m]),
                "first_pass": pct(trend_first_pass[m]),
                "discipline": pct(discipline[m]),
            }
            for m in trend_months
        ]

        # ---- stale members --------------------------------------------------
        last_log = {r["_id"]: r.get("last") for r in last_log_rows}
        stale_before = _working_days_back(today, STALE_WORKING_DAYS).isoformat()
        stale = [
            {"id": u["id"], "name": u.get("name", ""), "department": u.get("department", ""),
             "last_logged": last_log.get(u["id"])}
            for u in members
            if not last_log.get(u["id"]) or last_log[u["id"]] < stale_before
        ]

        used_projects = {r["project_id"] for r in rows_out}
        return {
            "month": month,
            "today": today_s,
            "definitions": {
                "at_risk_days": AT_RISK_DAYS,
                "critical_late_days": CRITICAL_LATE_DAYS,
                "stale_working_days": STALE_WORKING_DAYS,
                "next_days": NEXT_DAYS,
            },
            "deliverables": rows_out,
            # Open deliverables with no deadline of their own and none on their
            # project either: they cannot be placed in any month.
            "unscheduled": unscheduled,
            "reviews": reviews_out,
            "projects": {pid: project_by_id[pid] for pid in used_projects},
            "trend": trend,
            "members": {
                "tracked": [
                    {"id": u["id"], "name": u.get("name", ""), "department": u.get("department", "")}
                    for u in members
                ],
                "stale": stale,
            },
        }

    @router.get("/dashboard/team-activity")
    async def dashboard_team_activity(request: Request):
        await require_admin(request)

        today = datetime.now(IST).date()
        today_s = today.isoformat()

        members, projects = await asyncio.gather(
            db.users.find(
                {"role": {"$in": ["member", "manager"]}, "active": {"$ne": False}},
                {"_id": 0, "id": 1},
            ).to_list(None),
            db.projects.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(None),
        )
        member_ids = [u["id"] for u in members if u.get("id")]
        activity_items = await db.work_items.find(
            {
                "creator_id": {"$in": member_ids},
                "work_date": {"$gte": (today - timedelta(days=ACTIVITY_DAYS)).isoformat()},
            },
            {
                "_id": 0, "creator_id": 1, "deliverable_name": 1, "project_id": 1, "stage": 1,
                "status": 1, "time_taken_minutes": 1, "work_date": 1,
                "created_at": 1, "updated_at": 1,
            },
        ).to_list(None)

        def minutes_of(w) -> float:
            try:
                return max(float(w.get("time_taken_minutes") or 0), 0.0)
            except (TypeError, ValueError):
                return 0.0

        def touched(w) -> str:
            return w.get("updated_at") or w.get("created_at") or ""

        project_name_any = {p["id"]: p.get("name", "") for p in projects if p.get("id")}
        week_start_s = (today - timedelta(days=today.weekday())).isoformat()
        working_days_so_far = min(today.weekday(), 4) + 1
        items_by_user: Dict[str, List[dict]] = {}
        for w in activity_items:
            items_by_user.setdefault(w["creator_id"], []).append(w)

        out = []
        for uid in member_ids:
            mine = items_by_user.get(uid, [])
            todays = sorted(
                (w for w in mine if w.get("work_date") == today_s), key=touched, reverse=True
            )
            latest = todays[0] if todays else None
            recent = sorted(
                mine, key=lambda w: (w.get("work_date") or "", touched(w)), reverse=True
            )[:ACTIVITY_RECENT]
            out.append({
                "user_id": uid,
                "today_minutes": round(sum(minutes_of(w) for w in todays)),
                "week_minutes": round(sum(
                    minutes_of(w) for w in mine if (w.get("work_date") or "") >= week_start_s
                )),
                "now": None if not latest else {
                    "name": latest.get("deliverable_name") or "Untitled work item",
                    "project": project_name_any.get(latest.get("project_id"), ""),
                    "stage": latest.get("stage"),
                    "status": latest.get("status"),
                    "minutes": round(minutes_of(latest)),
                },
                "recent": [
                    {
                        "name": w.get("deliverable_name") or "Untitled work item",
                        "project": project_name_any.get(w.get("project_id"), ""),
                        "status": w.get("status"),
                        "minutes": round(minutes_of(w)),
                        "date": w.get("work_date"),
                    }
                    for w in recent
                ],
            })

        return {
            "working_day": today.weekday() < 5,
            "week_expected_minutes": working_days_so_far * WORKDAY_MINUTES,
            "members": out,
        }

    return router