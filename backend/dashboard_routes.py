"""Dashboard routes: the summary cards, team summary, attention list and overview.

Moved out of server.py unchanged; everything the routes use from the
application is passed to create_dashboard_router().
"""
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import Request
from fastapi import APIRouter


def create_dashboard_router(
    db,
    DONE_STATUSES,
    NON_TEAM_ROLES,
    PROJECT_STATUSES,
    STAGES,
    STATUSES,
    _valid_minutes,
    cached_read,
    require_admin,
) -> APIRouter:
    router = APIRouter()

    @router.get("/dashboard/summary")
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


    @router.get("/dashboard/team-summary")
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


    @router.get("/dashboard/attention-items")
    async def dashboard_attention_items(request: Request):
        await require_admin(request)
        items = await db.work_items.find(
            {"status": {"$in": ["Ready for Review", "Changes Requested"]}}, {"_id": 0}
        ).sort("updated_at", 1).to_list(50)
        users = {u["id"]: u["name"] for u in await db.users.find({}, {"_id": 0}).to_list(1000)}
        for it in items:
            it["creator_name"] = users.get(it.get("creator_id"), "Unassigned")
        return items

    @router.get("/dashboard/overview")
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

    return router
