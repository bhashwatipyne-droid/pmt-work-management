"""Option lists and the Work Sheet dropdown data: /config/options, /worksheet/deliverable-names, /worksheet/lookups.

Moved out of server.py unchanged; everything the routes use from the
application is passed to create_lookups_router().
"""
import asyncio
from fastapi import Request
from fastapi import APIRouter


def create_lookups_router(
    db,
    APPROVAL_TYPES,
    CLIENT_STATUSES,
    DELIVERABLE_TYPES,
    DELIVERABLE_TYPE_CATEGORIES,
    DELIVERABLE_TYPE_UNITS,
    DEPARTMENTS,
    MEMBER_FORWARD_STATUSES,
    PROJECT_STATUSES,
    ROLES,
    STAGES,
    STAGE_STATUSES,
    STATUSES,
    WORK_CATEGORIES,
    get_acting_user,
) -> APIRouter:
    router = APIRouter()

    @router.get("/config/options")
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


    @router.get("/worksheet/deliverable-names")
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


    @router.get("/worksheet/lookups")
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

    return router
