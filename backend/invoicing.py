"""Invoicing (HR / Finance).

When an admin moves a project to "Ready for Invoice" it appears on the HR
dashboard. HR opens it, sees every piece of work logged against it (who made it,
how long it took, its link), can correct the invoice's own copy of a line, and
marks the invoice raised ("Raised Invoice"). Moving it back reverses that.

Nothing here changes the Work Sheet: corrections HR makes are kept on the project
(`invoice_line_edits`) and never written back to the work items, so efficiency
and the worksheet stay exactly as the team logged them.

  GET   /invoicing/projects?tab=ready|raised   list for the HR dashboard
  GET   /invoicing/projects/{id}               costing view (pieces)
  PUT   /invoicing/projects/{id}/lines/{work_item_id}   correct a line
  POST  /invoicing/projects/{id}/raise         Ready for Invoice -> Raised Invoice
  POST  /invoicing/projects/{id}/undo          Raised Invoice -> Ready for Invoice

HR and admin can read; HR (and admin) can raise / undo.
"""
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict

READY = "Ready for Invoice"
RAISED = "Raised Invoice"

# Work-sheet stage -> the category finance bills it under.
STAGE_CATEGORY = {"Content": "Content", "Design": "Design", "Animate": "Animation"}
CATEGORIES = ["Content", "Design", "Animation"]
CATEGORY_ROLE = {"Content": "Writer", "Design": "Designer", "Animation": "Animator"}

# Projects brought over from the old Google Sheet ("PROJECT - nnn") have no code,
# contact, status date or project-linked work rows, so they would show up here as
# empty lines. They were invoiced in the sheet; only projects handled in the app
# belong on the HR dashboard.
NOT_LEGACY = {"source": {"$ne": "legacy_sheet"}, "id": {"$not": re.compile(r"^PROJECT - ")}}


class LineEdit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: Optional[str] = None
    type: Optional[str] = None
    qty: Optional[float] = None
    duration_seconds: Optional[int] = None
    link: Optional[str] = None


def _days_since(iso: Optional[str]) -> int:
    if not iso:
        return 0
    try:
        then = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
    except ValueError:
        return 0
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    return max(0, (datetime.now(timezone.utc) - then).days)


def create_invoicing_router(
    db,
    get_acting_user,
    move_project_to_status,
    now_iso,
    log_activity,
) -> APIRouter:
    router = APIRouter(prefix="/invoicing", tags=["invoicing"])

    async def require_invoicing(request: Request):
        user = await get_acting_user(request)
        if user.role not in ("hr", "admin"):
            raise HTTPException(status_code=403, detail="Invoicing is available to HR and admins only")
        return user

    async def _work_rows(project_id: str) -> List[dict]:
        return await db.work_items.find(
            {"project_id": project_id, "status": {"$ne": "Scrap"}}, {"_id": 0}
        ).sort([("work_date", 1), ("id", 1)]).to_list(5000)

    def _lines(rows: List[dict], edits: Dict[str, dict], people: Dict[str, dict]) -> List[dict]:
        """One line per piece. A collaborator's copy of a row is the same piece, so
        it adds its time to the original instead of being billed again."""
        by_id = {r["id"]: r for r in rows}
        lines: Dict[str, dict] = {}
        order: List[str] = []
        for r in rows:
            if r.get("collab_source_id") and r["collab_source_id"] in by_id:
                continue
            cat = STAGE_CATEGORY.get(r.get("stage") or "", "Content")
            e = edits.get(r["id"], {})
            maker = people.get(r.get("creator_id") or "", {})
            seconds = r.get("video_duration_seconds")
            lines[r["id"]] = {
                "id": r["id"],
                "category": cat,
                "name": e.get("name") if e.get("name") is not None else (r.get("deliverable_name") or ""),
                "type": e.get("type") if e.get("type") is not None else (r.get("deliverable_type") or ""),
                "qty": e["qty"] if e.get("qty") is not None else (r.get("quantity") or 1),
                "duration_seconds": e["duration_seconds"] if e.get("duration_seconds") is not None else seconds,
                "minutes": float(r.get("time_taken_minutes") or 0),
                "made_by": maker.get("name") or "Unassigned",
                "made_by_role": CATEGORY_ROLE[cat],
                "link": e.get("link") if e.get("link") is not None else (r.get("deliverable_link") or ""),
            }
            order.append(r["id"])
        for r in rows:
            src = r.get("collab_source_id")
            if src and src in lines:
                lines[src]["minutes"] += float(r.get("time_taken_minutes") or 0)
        return [lines[i] for i in order]

    async def _people(rows: List[dict]) -> Dict[str, dict]:
        ids = list({r.get("creator_id") for r in rows if r.get("creator_id")})
        if not ids:
            return {}
        docs = await db.users.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(len(ids))
        return {d["id"]: d for d in docs}

    def _summary(lines: List[dict]) -> Dict[str, dict]:
        out = {c: {"qty": 0, "minutes": 0.0} for c in CATEGORIES}
        for ln in lines:
            out[ln["category"]]["qty"] += ln["qty"]
            out[ln["category"]]["minutes"] += ln["minutes"]
        for c in CATEGORIES:
            out[c]["qty"] = round(out[c]["qty"])
            out[c]["minutes"] = round(out[c]["minutes"])
        return out

    async def _meta(project: dict, clients: Dict[str, dict]) -> dict:
        client = clients.get(project.get("client_id") or "", {})
        poc_name = ""
        if project.get("poc_id"):
            for c in client.get("contact_persons") or []:
                if c.get("id") == project["poc_id"]:
                    poc_name = c.get("name") or ""
                    break
        status = project.get("status")
        changed = project.get("status_changed_at") or project.get("updated_at")
        return {
            "id": project["id"],
            "name": project.get("name", ""),
            "code": project.get("code") or "",
            "client": client.get("name", ""),
            "poc": poc_name,
            "status": status,
            "status_changed_at": changed,
            "waiting_days": _days_since(changed),
            "invoice_raised_at": project.get("invoice_raised_at"),
        }

    async def _clients_for(projects: List[dict]) -> Dict[str, dict]:
        ids = list({p.get("client_id") for p in projects if p.get("client_id")})
        if not ids:
            return {}
        docs = await db.clients.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "contact_persons": 1}
        ).to_list(len(ids))
        return {d["id"]: d for d in docs}

    @router.get("/projects")
    async def list_invoice_projects(request: Request, tab: str = Query("ready")):
        await require_invoicing(request)
        status = RAISED if tab == "raised" else READY
        projects = await db.projects.find({"status": status, **NOT_LEGACY}, {"_id": 0}).sort(
            "status_changed_at", 1
        ).to_list(2000)
        clients = await _clients_for(projects)

        # Ready and Raised counts for the two tabs, whichever one is open.
        counts = {
            "ready": await db.projects.count_documents({"status": READY, **NOT_LEGACY}),
            "raised": await db.projects.count_documents({"status": RAISED, **NOT_LEGACY}),
        }

        # One query for every project's work rows and one for the people who made
        # them (this used to be two queries per project, which made the page crawl).
        project_ids = [p["id"] for p in projects]
        by_project: Dict[str, List[dict]] = {pid: [] for pid in project_ids}
        rows_all: List[dict] = []
        if project_ids:
            rows_all = await db.work_items.find(
                {"project_id": {"$in": project_ids}, "status": {"$ne": "Scrap"}},
                {
                    "_id": 0, "id": 1, "project_id": 1, "stage": 1, "creator_id": 1,
                    "collab_source_id": 1, "quantity": 1, "time_taken_minutes": 1,
                    "deliverable_name": 1, "deliverable_type": 1, "deliverable_link": 1,
                    "video_duration_seconds": 1,
                },
            ).to_list(50000)
            for r in rows_all:
                by_project.setdefault(r["project_id"], []).append(r)
        people = await _people(rows_all)

        rows = []
        for p in projects:
            lines = _lines(by_project.get(p["id"], []), p.get("invoice_line_edits") or {}, people)
            summary = _summary(lines)
            rows.append(
                {
                    **await _meta(p, clients),
                    "counts": {c: summary[c]["qty"] for c in CATEGORIES},
                    "minutes": sum(summary[c]["minutes"] for c in CATEGORIES),
                }
            )
        return {"tab": "raised" if tab == "raised" else "ready", "counts": counts, "projects": rows}

    async def _project_or_404(project_id: str) -> dict:
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project or project.get("status") not in (READY, RAISED):
            raise HTTPException(status_code=404, detail="This project is not in invoicing")
        return project

    @router.get("/projects/{project_id}")
    async def get_invoice_project(project_id: str, request: Request):
        await require_invoicing(request)
        project = await _project_or_404(project_id)
        clients = await _clients_for([project])
        work = await _work_rows(project_id)
        lines = _lines(work, project.get("invoice_line_edits") or {}, await _people(work))
        return {
            **await _meta(project, clients),
            "categories": _summary(lines),
            "lines": lines,
        }

    @router.put("/projects/{project_id}/lines/{work_item_id}")
    async def edit_invoice_line(project_id: str, work_item_id: str, payload: LineEdit, request: Request):
        user = await require_invoicing(request)
        project = await _project_or_404(project_id)
        belongs = await db.work_items.find_one(
            {"id": work_item_id, "project_id": project_id}, {"_id": 0, "id": 1}
        )
        if not belongs:
            raise HTTPException(status_code=404, detail="Line not found")
        patch = payload.model_dump(exclude_unset=True)
        if patch.get("qty") is not None and patch["qty"] < 0:
            raise HTTPException(status_code=400, detail="Quantity cannot be negative")
        edits = dict(project.get("invoice_line_edits") or {})
        edits[work_item_id] = {**edits.get(work_item_id, {}), **patch}
        await db.projects.update_one(
            {"id": project_id}, {"$set": {"invoice_line_edits": edits, "updated_at": now_iso()}}
        )
        await log_activity(
            collection_name="project_activity_log",
            entity_id=project_id,
            entity_field="project_id",
            action="INVOICE_LINE_EDITED",
            changed_by=user.id,
            new_value={"work_item_id": work_item_id, **patch},
        )
        return {"ok": True}

    async def _set_status(project_id: str, user, expect: str, target: str, action: str):
        project = await db.projects.find_one({"id": project_id}, {"_id": 0})
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
        if project.get("status") != expect:
            raise HTTPException(status_code=409, detail=f'This project is not "{expect}"')
        await move_project_to_status(project_id, target, 0)
        stamp = now_iso()
        extra = (
            {"invoice_raised_at": stamp, "invoice_raised_by": user.id}
            if target == RAISED
            else {"invoice_raised_at": None, "invoice_raised_by": None}
        )
        await db.projects.update_one({"id": project_id}, {"$set": extra})
        await log_activity(
            collection_name="project_activity_log",
            entity_id=project_id,
            entity_field="project_id",
            action=action,
            changed_by=user.id,
            old_value=expect,
            new_value=target,
        )
        return {"ok": True, "status": target, "status_changed_at": stamp}

    @router.post("/projects/{project_id}/raise")
    async def raise_invoice(project_id: str, request: Request):
        user = await require_invoicing(request)
        return await _set_status(project_id, user, READY, RAISED, "INVOICE_RAISED")

    @router.post("/projects/{project_id}/undo")
    async def undo_raise_invoice(project_id: str, request: Request):
        user = await require_invoicing(request)
        return await _set_status(project_id, user, RAISED, READY, "INVOICE_MOVED_BACK_TO_READY")

    return router
