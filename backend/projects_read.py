"""Project reads: the list, the numbers on the Projects page, the duplicate
warning, one project, and its work log.

    GET /projects                      list (hidden projects: admin only)
    GET /projects/metrics              active / in rework / due this week / deliverables
    GET /projects/duplicate-check      admin: same-named recent projects for a client
    GET /projects/{id}                 one project with its deliverables
    GET /projects/{id}/work-log        newest work rows for the project page

/projects/metrics and /projects/duplicate-check are registered before
/projects/{id} so they are not read as a project id. The hydrate helpers are
also used by the project write routes still in server.py.
"""
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, List, Optional

from fastapi import APIRouter, HTTPException, Request

try:
    from domain_constants import STAGES
except ImportError:  # run as backend.server from the repo root
    from backend.domain_constants import STAGES

PROJECT_WORK_LOG_CAP = 500


async def hydrate_projects(
    db,
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


async def hydrate_project(db, p: dict) -> dict:
    """
    Hydrate a single project.

    Used by the project detail endpoint.
    """
    hydrated = await hydrate_projects(db, [p])

    return hydrated[0] if hydrated else p


def _date_prefix(moment: datetime) -> str:
    """YYYY-MM-DD of `moment`, for a coarse string comparison against the ISO
    timestamps stored on projects (whose formats differ after the date)."""
    return moment.astimezone(timezone.utc).date().isoformat()


async def projects_touched_since(db, client_id: Optional[str], since: datetime) -> list:
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


def create_projects_read_router(
    db,
    get_acting_user: Callable[..., Awaitable],
    require_admin: Callable[..., Awaitable],
    cached_read: Callable[..., Awaitable],
    search_clauses: Callable[[str, List[str]], List[dict]],
    project_list_limit: int,
    project_duplicates,
) -> APIRouter:
    PROJECT_LIST_LIMIT = project_list_limit
    router = APIRouter()

    @router.get("/projects")
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

        return await hydrate_projects(
            db,
            projects,
            include_deliverables=include_deliverables,
        )


    @router.get("/projects/metrics")
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


    @router.get("/projects/duplicate-check")
    async def check_project_duplicates(client_id: str, name: str, request: Request):
        """Projects for this client with the same name that were created or changed
        in the last 30 days. Only informs: creating a project never waits on it, since
        a same-named project can be a genuine repeat (a monthly brochure) as easily as
        a double entry. Declared before /projects/{project_id} so it is not read as one."""
        await require_admin(request)
        now = datetime.now(timezone.utc)
        window = project_duplicates.DUPLICATE_WINDOW_DAYS
        candidates = await projects_touched_since(db, client_id, now - timedelta(days=window))
        return {
            "window_days": window,
            "duplicates": project_duplicates.find_recent_duplicates(candidates, client_id, name, now, window),
        }


    @router.get("/projects/{project_id}")
    async def get_project(project_id: str, request: Request):
        # Project detail is read-only for everyone; every write endpoint below
        # (create / update / hide / delete / import) stays admin-only.
        await get_acting_user(request)
        p = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not p:
            raise HTTPException(status_code=404, detail="Project not found")
        return await hydrate_project(db, p)


    @router.get("/projects/{project_id}/work-log")
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

    return router
