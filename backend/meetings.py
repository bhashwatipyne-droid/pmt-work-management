"""Meetings: Google Calendar events of a few company calendars, shown in PMT.

A background sweep reads each calendar in CALENDAR_IDS through the Google
Calendar API (free; read-only) and keeps a copy in calendar_events, so the
Meetings page never waits on Google and keeps working if Google is down.

Access is a Google Workspace service account with domain-wide delegation: the
Workspace admin allows it the read-only calendar scope once, and it reads each
calendar "as" that mailbox. Set up: docs/google-calendar-setup.md.

Env:
  GOOGLE_CALENDAR_SERVICE_ACCOUNT  the service account's JSON key (raw JSON or
                                   base64 of it). Unset = sync is off.
  CALENDAR_IDS                     comma-separated mailboxes to read
  CALENDAR_SYNC_MINUTES            how often to sync (default 10)

  GET  /meetings?start=&end=   events overlapping [start, end) (ISO dates/times)
  GET  /meetings/status        calendars, last sync, errors, configured?
  POST /meetings/sync          sync now (admin)

Collections:
  calendar_events      one per (calendar, Google event id)
  calendar_sync_state  one per calendar: last_synced_at, last_error, count
"""
import asyncio
import base64
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger(__name__)

EVENTS = "calendar_events"
STATE = "calendar_sync_state"
SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
API = "https://www.googleapis.com/calendar/v3"

DEFAULT_CALENDARS = "content@finace.co,product@finace.co,animate@finace.co"
# Window kept in sync: a month back (for looking back) and a quarter ahead.
PAST_DAYS = 31
FUTURE_DAYS = 92
# Descriptions can be long (pasted agendas, Meet boilerplate); keep enough to read.
MAX_DESCRIPTION = 4000


def calendar_ids() -> List[str]:
    raw = os.environ.get("CALENDAR_IDS", DEFAULT_CALENDARS)
    return [c.strip().lower() for c in raw.split(",") if c.strip()]


def service_account_info() -> Optional[dict]:
    raw = (os.environ.get("GOOGLE_CALENDAR_SERVICE_ACCOUNT") or "").strip()
    if not raw:
        return None
    try:
        if not raw.startswith("{"):
            raw = base64.b64decode(raw).decode("utf-8")
        return json.loads(raw)
    except Exception:
        logger.error("GOOGLE_CALENDAR_SERVICE_ACCOUNT is not valid JSON (or base64 JSON)")
        return None


def _access_token(info: dict, mailbox: str) -> str:
    """A short-lived token to read `mailbox`'s calendar (blocking: run in a thread)."""
    from google.auth.transport.requests import Request as GoogleRequest
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_info(info, scopes=[SCOPE]).with_subject(mailbox)
    creds.refresh(GoogleRequest())
    return creds.token


def _when(value: dict) -> tuple:
    """Google's {dateTime} / {date} -> (ISO string, all_day)."""
    if not value:
        return None, False
    if value.get("dateTime"):
        return value["dateTime"], False
    return value.get("date"), True


def _meet_link(event: dict) -> str:
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    for ep in (event.get("conferenceData") or {}).get("entryPoints") or []:
        if ep.get("entryPointType") == "video" and ep.get("uri"):
            return ep["uri"]
    return ""


def to_doc(calendar: str, event: dict, now: str) -> Optional[dict]:
    """A Google event -> what we store. None for cancelled events."""
    if event.get("status") == "cancelled":
        return None
    start, all_day = _when(event.get("start") or {})
    end, _ = _when(event.get("end") or {})
    if not start:
        return None
    private = event.get("visibility") in ("private", "confidential")
    attendees = [
        {
            "email": (a.get("email") or "").lower(),
            "name": a.get("displayName") or "",
            "response": a.get("responseStatus") or "",
            "organizer": bool(a.get("organizer")),
        }
        for a in event.get("attendees") or []
        if not a.get("resource")
    ]
    me = next((a for a in attendees if a["email"] == calendar), None)
    doc = {
        "id": f"{calendar}:{event['id']}",
        "calendar": calendar,
        "event_id": event["id"],
        "ical_uid": event.get("iCalUID") or event["id"],
        "summary": event.get("summary") or "(No title)",
        "description": (event.get("description") or "")[:MAX_DESCRIPTION],
        "location": event.get("location") or "",
        "start": start,
        "end": end or start,
        "all_day": all_day,
        "attendees": attendees,
        "organizer": ((event.get("organizer") or {}).get("email") or "").lower(),
        "my_response": me["response"] if me else "",
        "meet_link": _meet_link(event),
        "html_link": event.get("htmlLink") or "",
        "recurring": bool(event.get("recurringEventId")),
        "private": private,
        "updated": event.get("updated") or "",
        "synced_at": now,
    }
    if private:
        # A private event shows as busy time, nothing more.
        doc.update(summary="Busy", description="", location="", attendees=[], meet_link="", html_link="")
    return doc


def _iso_day(value: str) -> str:
    return value[:10]


def create_meetings_router(
    db,
    get_acting_user: Callable[[Request], Awaitable[Any]],
    now_iso: Callable[[], str],
    fetch_events: Optional[Callable[[str, str, str], Awaitable[List[dict]]]] = None,
) -> APIRouter:
    """fetch_events(calendar, time_min, time_max) -> Google event dicts. Tests
    pass a fake; by default it calls the Google Calendar API."""
    router = APIRouter(prefix="/meetings", tags=["meetings"])
    events = db[EVENTS]
    state = db[STATE]

    async def google_fetch(calendar: str, time_min: str, time_max: str) -> List[dict]:
        info = service_account_info()
        if not info:
            raise RuntimeError("Google Calendar is not connected (GOOGLE_CALENDAR_SERVICE_ACCOUNT is not set)")
        token = await asyncio.to_thread(_access_token, info, calendar)
        out, page = [], None
        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                params = {
                    "timeMin": time_min,
                    "timeMax": time_max,
                    "singleEvents": "true",  # recurring meetings as separate occurrences
                    "showDeleted": "false",
                    "maxResults": "2500",
                }
                if page:
                    params["pageToken"] = page
                res = await client.get(
                    f"{API}/calendars/{quote(calendar)}/events",
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
                if res.status_code != 200:
                    raise RuntimeError(f"Google said {res.status_code}: {res.text[:300]}")
                body = res.json()
                out.extend(body.get("items") or [])
                page = body.get("nextPageToken")
                if not page:
                    return out

    fetch = fetch_events or google_fetch

    async def sync_calendar(calendar: str) -> int:
        now = datetime.now(timezone.utc)
        time_min = (now - timedelta(days=PAST_DAYS)).replace(microsecond=0).isoformat()
        time_max = (now + timedelta(days=FUTURE_DAYS)).replace(microsecond=0).isoformat()
        ts = now_iso()
        try:
            raw = await fetch(calendar, time_min, time_max)
        except Exception as exc:
            logger.warning("Calendar sync failed for %s: %s", calendar, exc)
            await state.update_one(
                {"calendar": calendar},
                {"$set": {"calendar": calendar, "last_error": str(exc)[:500], "last_attempt_at": ts}},
                upsert=True,
            )
            return 0
        docs = [d for d in (to_doc(calendar, e, ts) for e in raw) if d]
        for d in docs:
            await events.replace_one({"id": d["id"]}, d, upsert=True)
        # Anything in the window Google no longer returns was deleted or moved out.
        await events.delete_many({
            "calendar": calendar,
            "synced_at": {"$ne": ts},
            "start": {"$gte": time_min[:10], "$lte": time_max},
        })
        await state.update_one(
            {"calendar": calendar},
            {"$set": {
                "calendar": calendar,
                "last_synced_at": ts,
                "last_attempt_at": ts,
                "last_error": "",
                "event_count": len(docs),
            }},
            upsert=True,
        )
        return len(docs)

    async def sync_all() -> Dict[str, int]:
        return {c: await sync_calendar(c) for c in calendar_ids()}

    async def staff(request: Request):
        user = await get_acting_user(request)
        if user.role not in ("admin", "manager", "member"):
            raise HTTPException(status_code=403, detail="Meetings are for the production team")
        return user

    async def client_domains() -> Dict[str, dict]:
        """Email domain -> client, from client contacts (for tagging meetings)."""
        public = {"gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "finace.co"}
        out: Dict[str, dict] = {}
        async for c in db.clients.find({}, {"_id": 0, "id": 1, "name": 1, "contact_persons": 1}):
            for p in c.get("contact_persons") or []:
                domain = (p.get("email") or "").lower().rpartition("@")[2]
                if domain and domain not in public and domain not in out:
                    out[domain] = {"id": c["id"], "name": c.get("name") or ""}
        return out

    @router.get("")
    async def list_meetings(request: Request, start: str, end: str):
        await staff(request)
        if len(start) < 10 or len(end) < 10:
            raise HTTPException(status_code=400, detail="start and end must be ISO dates")
        # Stored start/end are ISO strings with offsets (or plain dates for
        # all-day events); comparing the date part keeps the query simple and
        # the page trims to the exact hour.
        rows = await events.find(
            {"start": {"$lt": end[:10] + "￿"}, "end": {"$gte": start[:10]}},
            {"_id": 0},
        ).sort("start", 1).to_list(5000)
        domains = await client_domains()
        for r in rows:
            for a in r.get("attendees") or []:
                hit = domains.get(a["email"].rpartition("@")[2])
                if hit:
                    r["client"] = hit
                    break
        return rows

    @router.get("/status")
    async def status(request: Request):
        await staff(request)
        states = {s["calendar"]: s for s in await state.find({}, {"_id": 0}).to_list(100)}
        return {
            "configured": service_account_info() is not None or fetch_events is not None,
            "calendars": [{"calendar": c, **states.get(c, {})} for c in calendar_ids()],
        }

    @router.post("/sync")
    async def sync_now(request: Request):
        user = await get_acting_user(request)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can start a sync")
        return {"synced": await sync_all()}

    router.sync_all = sync_all  # for the background loop and tests
    return router


async def calendar_sync_loop(sync_all: Callable[[], Awaitable[Dict[str, int]]]):
    minutes = max(1.0, float(os.environ.get("CALENDAR_SYNC_MINUTES", "10")))
    while True:
        if service_account_info():
            try:
                counts = await sync_all()
                logger.info("Calendar sync: %s", counts)
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Calendar sync failed")
        await asyncio.sleep(minutes * 60)


async def ensure_meeting_indexes(db):
    await db[EVENTS].create_index("id")
    await db[EVENTS].create_index([("calendar", 1), ("start", 1)])
    await db[EVENTS].create_index([("start", 1), ("end", 1)])
