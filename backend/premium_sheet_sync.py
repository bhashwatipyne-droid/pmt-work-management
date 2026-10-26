"""Premium Content planner sheet -> PMT.

    POST /integrations/premium-sheet/sync     (header X-Sync-Token)

The team leaders keep adding rows to the "Premium Content" tab of the TFP Premium
Content Planner. A small Apps Script in that sheet posts the rows here; every
row that is not in PMT yet becomes a deliverable in that month's project
("TFP Oct-26" under client Thefinpedia, created if missing). Append-only: rows
already in PMT are skipped, nothing in PMT is edited or deleted.

Only months from PREMIUM_SHEET_FROM_MONTH (default 2026-10) onward are synced.
Auth is a shared secret in the SHEET_SYNC_TOKEN env var (the sheet has no PMT
login). With no token configured the endpoint is switched off.

Body: {"rows": [{"row": 3990, "month": "2026-10-26", "format": "Reel",
        "title": "...", "status": "Scripting under Review",
        "content_date": "...", "design_date": "...", "animation_date": "..."}],
       "dry_run": false}
"""
import hashlib
import logging
import os
import re
import secrets
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

try:
    from common import now_iso
    from db_client import db
    from models import Project
    from notifications import _fire_and_forget, _keyed_lock
    from project_helpers import (
        _build_deliverable_batch,
        _generate_unique_project_code,
        _notify_new_project_safely,
        _persist_deliverable_batch,
        _place_new_project_at_top,
        _rollback_deliverable_batch,
    )
    from security import log_activity
except ImportError:  # run as backend.server from the repo root
    from backend.common import now_iso
    from backend.db_client import db
    from backend.models import Project
    from backend.notifications import _fire_and_forget, _keyed_lock
    from backend.project_helpers import (
        _build_deliverable_batch,
        _generate_unique_project_code,
        _notify_new_project_safely,
        _persist_deliverable_batch,
        _place_new_project_at_top,
        _rollback_deliverable_batch,
    )
    from backend.security import log_activity

logger = logging.getLogger("server")

SOURCE = "premium_sheet"
CHANGED_BY = "system:premium_sheet"
MAX_ROWS = 1000
CLIENT_NAME = os.environ.get("PREMIUM_SHEET_CLIENT_NAME", "Thefinpedia")
# Rows for months before this (YYYY-MM) are ignored: older months were loaded
# into PMT by the October 2026 ingest and must not be re-added.
FROM_MONTH = os.environ.get("PREMIUM_SHEET_FROM_MONTH", "2026-10")

# Sheet "Format" -> PMT deliverable type, and the stages that type goes through
# (the same shape the October 2026 TFP ingest used).
FORMAT_MAP: Dict[str, Tuple[str, List[str]]] = {
    "minimalist": ("Minimalist", ["Content", "Design"]),
    "carousel": ("Carousel", ["Content", "Design"]),
    "infographic": ("One Pager / Infographic", ["Content", "Design"]),
    "one pager": ("One Pager / Infographic", ["Content", "Design"]),
    "reel": ("Reel / Short Video", ["Content", "Design", "Animate"]),
    "av": ("Reel / Short Video", ["Content", "Design", "Animate"]),
    "video": ("Long Video", ["Content", "Design", "Animate"]),
    "long video": ("Long Video", ["Content", "Design", "Animate"]),
}

# Sheet "Status" -> (current stage, finished). None = do not import the row.
STATUS_MAP: Dict[str, Optional[Tuple[str, bool]]] = {
    "under ideation": ("Content", False),
    "under scripting": ("Content", False),
    "scripting under review": ("Content", False),
    "scripting changes in process - post feedback": ("Content", False),
    "script reviewed": ("Content", False),
    "can be taken into design": ("Design", False),
    "under design": ("Design", False),
    "design approval pending": ("Design", False),
    "under internal design changes": ("Design", False),
    "can be taken into animation": ("Animate", False),
    "under animation": ("Animate", False),
    "animation under review": ("Animate", False),
    "post animation changes": ("Animate", False),
    "ready for upload": ("LAST", True),
    "uploaded": ("LAST", True),
    "delivered": ("LAST", True),
    "dropped": None,
    "on hold": None,
}

_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1)}


class SheetRow(BaseModel):
    row: Optional[int] = None
    month: Optional[Any] = None  # "Month & Year" cell: a date, or text like "Sept 26"
    format: Optional[str] = None
    title: Optional[str] = None
    status: Optional[str] = None
    content_date: Optional[Any] = None
    design_date: Optional[Any] = None
    animation_date: Optional[Any] = None


class SheetPayload(BaseModel):
    rows: List[SheetRow]
    dry_run: bool = False


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def parse_month(value: Any) -> Optional[Tuple[int, int]]:
    """(year, month) from a date cell, an ISO string or text like "Sept 26" /
    "Oct 2026". None when it is not a single month ("Before April 2025")."""
    if isinstance(value, (date, datetime)):
        return value.year, value.month
    text = _clean(value).lower()
    if not text or text.startswith("before"):
        return None
    iso = re.match(r"^(\d{4})-(\d{2})(-\d{2})?", text)
    if iso:
        return int(iso.group(1)), int(iso.group(2))
    named = re.match(r"^([a-z]{3})[a-z]*[\s\-_']*(\d{2}|\d{4})$", text)
    if named and named.group(1) in _MONTHS:
        year = int(named.group(2))
        return (year + 2000 if year < 100 else year), _MONTHS[named.group(1)]
    return None


def project_name(year: int, month: int) -> str:
    """Same naming as the existing monthly projects: "TFP Oct-26"."""
    return f"TFP {date(year, month, 1).strftime('%b')}-{year % 100:02d}"


def parse_day(value: Any) -> Optional[str]:
    if isinstance(value, (date, datetime)):
        return value.strftime("%Y-%m-%d")
    text = _clean(value)
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}" if match else None


def row_key(project_id: str, title: str, dtype: str) -> str:
    return hashlib.sha1(f"{project_id}|{title.lower()}|{dtype.lower()}".encode()).hexdigest()


def map_row(row: SheetRow) -> Dict[str, Any]:
    """One sheet row -> {"skip": reason} or the pieces PMT needs."""
    title = _clean(row.title)
    if not title:
        return {"skip": "no title"}
    month = parse_month(row.month)
    if not month:
        return {"skip": f"month '{_clean(row.month)}' is not a single month"}
    if f"{month[0]}-{month[1]:02d}" < FROM_MONTH:
        return {"skip": f"month is before {FROM_MONTH}"}
    fmt = FORMAT_MAP.get(_clean(row.format).lower())
    if not fmt:
        return {"skip": f"format '{_clean(row.format)}' has no PMT type"}
    dtype, stages = fmt
    status_key = _clean(row.status).lower()
    if status_key not in STATUS_MAP:
        return {"skip": f"status '{_clean(row.status)}' is not recognised"}
    target = STATUS_MAP[status_key]
    if target is None:
        return {"skip": f"status '{_clean(row.status)}' is not imported"}
    stage, finished = target
    if stage == "LAST":
        stage = stages[-1]
    if stage not in stages:  # e.g. "Under Animation" on a Carousel
        return {"skip": f"status '{_clean(row.status)}' does not fit a {dtype}"}
    schedule = {}
    for stage_name, raw in (("Content", row.content_date), ("Design", row.design_date), ("Animate", row.animation_date)):
        day = parse_day(raw)
        if day and stage_name in stages:
            schedule[stage_name] = {"start_dt": None, "end_dt": day}
    return {
        "year": month[0], "month": month[1], "title": title, "type": dtype, "stages": stages,
        "current_stage": stage, "finished": finished, "stage_schedule": schedule,
    }


def create_premium_sheet_router() -> APIRouter:
    router = APIRouter()

    async def _client_id() -> str:
        doc = await db.clients.find_one(
            {"name": {"$regex": f"^{re.escape(CLIENT_NAME)}$", "$options": "i"}}, {"_id": 0, "id": 1}
        )
        if not doc:
            raise HTTPException(status_code=500, detail=f"Client '{CLIENT_NAME}' not found in PMT")
        return doc["id"]

    async def _project_for(client_id: str, year: int, month: int, create: bool) -> Optional[dict]:
        name = project_name(year, month)
        async with _keyed_lock(f"premium-sheet-project:{name}"):
            doc = await db.projects.find_one(
                {"client_id": client_id, "name": name, "hidden": {"$ne": True}}, {"_id": 0}
            )
            if doc or not create:
                return doc
            ts = now_iso()
            first = date(year, month, 1)
            last = date(year + (month == 12), month % 12 + 1, 1).toordinal() - 1
            project = Project(
                code=await _generate_unique_project_code(), name=name, client_id=client_id,
                start_date=first.isoformat(), end_date=date.fromordinal(last).isoformat(),
                status="Active", kanban_order=0, status_changed_at=ts, created_at=ts, updated_at=ts,
            )
            doc = project.model_dump()
            doc["source"] = SOURCE
            await db.projects.insert_one(dict(doc))
            await _place_new_project_at_top(project.id, project.status)
            await log_activity(
                collection_name="project_activity_log", entity_id=project.id, entity_field="project_id",
                action="PROJECT_CREATED", changed_by=CHANGED_BY,
                new_value={"code": project.code, "name": project.name, "client_id": client_id, "status": "Active"},
            )
            return doc

    @router.post("/integrations/premium-sheet/sync")
    async def sync(payload: SheetPayload, request: Request):
        expected = os.environ.get("SHEET_SYNC_TOKEN", "").strip()
        given = request.headers.get("x-sync-token", "")
        if not expected or not secrets.compare_digest(given.encode(), expected.encode()):
            raise HTTPException(status_code=401, detail="Invalid sync token")
        if len(payload.rows) > MAX_ROWS:
            raise HTTPException(status_code=400, detail=f"Send at most {MAX_ROWS} rows per call")

        client_id = await _client_id()
        report: List[dict] = []
        by_project: Dict[Tuple[int, int], List[Tuple[SheetRow, dict]]] = {}
        for row in payload.rows:
            mapped = map_row(row)
            if "skip" in mapped:
                # Blank rows are normal in the sheet; only report real ones.
                if mapped["skip"] != "no title":
                    report.append({"row": row.row, "title": _clean(row.title), "result": "skipped", "reason": mapped["skip"]})
                continue
            by_project.setdefault((mapped["year"], mapped["month"]), []).append((row, mapped))

        created = 0
        for (year, month), items in by_project.items():
            project = await _project_for(client_id, year, month, create=not payload.dry_run)
            known = set()
            if project:
                for d in await db.deliverables.find(
                    {"project_id": project["id"]}, {"_id": 0, "name": 1, "type": 1}
                ).to_list(None):
                    known.add((_clean(d.get("name")).lower(), _clean(d.get("type")).lower()))
            specs, seen, pending = [], set(), []
            for row, m in items:
                key = (m["title"].lower(), m["type"].lower())
                if key in known or key in seen:
                    report.append({"row": row.row, "title": m["title"], "result": "exists"})
                    continue
                seen.add(key)
                specs.append({
                    "name": m["title"], "type": m["type"], "required_stages": m["stages"],
                    "approval_types": [], "stage_schedule": m["stage_schedule"],
                    "current_stage": m["current_stage"], "finished": m["finished"],
                })
                pending.append((row, m))
            if not specs:
                continue
            if payload.dry_run:
                for row, m in pending:
                    report.append({"row": row.row, "title": m["title"], "result": "would_create", "project": project_name(year, month)})
                continue

            ts = now_iso()
            async with _keyed_lock(f"premium-sheet-sync:{project['id']}"):
                docs, workflows, items_, activity = _build_deliverable_batch(project["id"], specs, CHANGED_BY, ts)
                for doc, (row, m) in zip(docs, pending):
                    doc["source"] = SOURCE
                    doc["sheet_row"] = row.row
                    doc["sheet_key"] = row_key(project["id"], m["title"], m["type"])
                try:
                    await _persist_deliverable_batch(docs, workflows, items_, activity)
                except Exception:
                    logger.exception("Premium sheet sync into %s failed part-way; rolling back", project["id"])
                    await _rollback_deliverable_batch(docs, workflows, items_, activity)
                    raise HTTPException(status_code=500, detail="Could not save the rows. Nothing was added, try again.")
            created += len(docs)
            for row, m in pending:
                report.append({"row": row.row, "title": m["title"], "result": "created", "project": project_name(year, month)})
            _fire_and_forget(_notify_new_project_safely(project, docs, title="New deliverable added"))

        return {
            "dry_run": payload.dry_run,
            "created": created,
            "exists": sum(1 for r in report if r["result"] == "exists"),
            "skipped": sum(1 for r in report if r["result"] == "skipped"),
            "report": report,
        }

    return router
