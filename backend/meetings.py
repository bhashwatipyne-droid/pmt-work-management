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
  CALENDAR_ICAL_URLS               optional, no Google Cloud needed: comma-separated
                                   mailbox=iCal-link pairs, e.g.
                                   projects@finace.co=https://calendar.google.com/.../basic.ics
                                   A calendar listed here is read from its iCal link
                                   (Google Calendar -> Settings -> Integrate calendar)
                                   instead of the service account.
  CALENDAR_SYNC_MINUTES            how often to sync (default 10)

  PUBLIC_API_URL                   optional: this API's public https address, for Google's
                                   change notifications (defaults to RENDER_EXTERNAL_URL)

  POST /meetings/webhook       Google's "this calendar changed" ping (push, no login:
                                   checked against a secret token kept per channel)
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
import hmac
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional
from urllib.parse import quote

import httpx
from fastapi import APIRouter, HTTPException, Request, Response

logger = logging.getLogger(__name__)

EVENTS = "calendar_events"
STATE = "calendar_sync_state"
WATCHES = "calendar_watch_channels"
SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
API = "https://www.googleapis.com/calendar/v3"

DEFAULT_CALENDARS = "content@finace.co,projects@finace.co,product@finace.co,animate@finace.co,info@finace.co"
# Window kept in sync: a month back (for looking back) and a quarter ahead.
PAST_DAYS = 31
FUTURE_DAYS = 92
# Descriptions can be long (pasted agendas, Meet boilerplate); keep enough to read.
MAX_DESCRIPTION = 4000


def calendar_ids() -> List[str]:
    raw = os.environ.get("CALENDAR_IDS", DEFAULT_CALENDARS)
    return [c.strip().lower() for c in raw.split(",") if c.strip()]


# Google's change notifications: a "channel" per calendar. Google caps them at
# about a week; they are renewed once less than RENEW_BEFORE_HOURS are left.
RENEW_BEFORE_HOURS = 24
CHANNEL_TTL_SECONDS = 6 * 24 * 3600


def public_api_url() -> str:
    """Where Google can reach this API (https only), without a trailing slash."""
    url = (os.environ.get("PUBLIC_API_URL") or os.environ.get("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    return url if url.startswith("https://") else ""


def webhook_address() -> str:
    base = public_api_url()
    return f"{base}/api/meetings/webhook" if base else ""


def ical_urls() -> Dict[str, str]:
    """mailbox -> iCal link, from CALENDAR_ICAL_URLS ("mailbox=url,mailbox=url")."""
    out = {}
    for part in (os.environ.get("CALENDAR_ICAL_URLS") or "").split(","):
        mailbox, sep, url = part.strip().partition("=")
        if sep and mailbox.strip() and url.strip().startswith("http"):
            out[mailbox.strip().lower()] = url.strip()
    return out


_MEET_RE = re.compile(r"https://meet\.google\.com/[a-z0-9\-]+", re.I)


def _ical_when(value) -> dict:
    """An iCal DTSTART/DTEND value -> Google's {dateTime} / {date}."""
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return {"dateTime": value.isoformat()}
    return {"date": value.isoformat()}


def ical_to_events(ics: bytes, time_min: str, time_max: str) -> List[dict]:
    """An .ics file -> Google-style event dicts (recurring meetings expanded to
    separate occurrences) so the rest of the sync does not care where they came from."""
    import icalendar
    import recurring_ical_events

    cal = icalendar.Calendar.from_ical(ics)
    lo = datetime.fromisoformat(time_min)
    hi = datetime.fromisoformat(time_max)
    # the library stamps every occurrence with RECURRENCE-ID, so ask the source events
    repeating = {
        str(e.get("UID")) for e in cal.walk("VEVENT")
        if e.get("RRULE") is not None or e.get("RDATE") is not None or e.get("RECURRENCE-ID") is not None
    }
    out = []
    for ev in recurring_ical_events.of(cal).between(lo, hi):
        start = _ical_when(ev.get("DTSTART").dt)
        end_prop = ev.get("DTEND")
        end = _ical_when(end_prop.dt) if end_prop else start
        uid = str(ev.get("UID") or "")
        if not uid:
            continue
        stamp = start.get("dateTime") or start.get("date")
        recurring = uid in repeating
        description = str(ev.get("DESCRIPTION") or "")
        location = str(ev.get("LOCATION") or "")
        organizer = ev.get("ORGANIZER")
        attendees = ev.get("ATTENDEE") or []
        if not isinstance(attendees, list):
            attendees = [attendees]
        meet = _MEET_RE.search(f"{location} {description} {ev.get('X-GOOGLE-CONFERENCE') or ''}")
        out.append({
            "id": f"{uid}_{stamp}",   # one stable id per occurrence
            "iCalUID": uid,
            "status": str(ev.get("STATUS") or "confirmed").lower(),
            "summary": str(ev.get("SUMMARY") or ""),
            "description": description,
            "location": location,
            "start": start,
            "end": end,
            "visibility": "private" if str(ev.get("CLASS") or "").upper() in ("PRIVATE", "CONFIDENTIAL") else "default",
            "organizer": {"email": str(organizer).replace("mailto:", "").lower()} if organizer else {},
            "attendees": [
                {
                    "email": str(a).replace("mailto:", "").lower(),
                    "displayName": str(a.params.get("CN", "")),
                    "responseStatus": {"ACCEPTED": "accepted", "DECLINED": "declined", "TENTATIVE": "tentative"}.get(
                        str(a.params.get("PARTSTAT", "")).upper(), "needsAction"),
                }
                for a in attendees
            ],
            "hangoutLink": meet.group(0) if meet else "",
            "recurringEventId": uid if recurring else "",
            "updated": "",
        })
    return out


def is_connected() -> bool:
    """Is there any way to read calendars (service account or iCal links)?"""
    return bool(ical_urls()) or service_account_info() is not None


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
    watch_api: Optional[Callable[[str, dict], Awaitable[dict]]] = None,
    stop_api: Optional[Callable[[str, dict], Awaitable[None]]] = None,
) -> APIRouter:
    """fetch_events(calendar, time_min, time_max) -> Google event dicts. Tests
    pass a fake; by default it calls the Google Calendar API. watch_api(calendar,
    body) / stop_api(calendar, body) subscribe to / cancel Google's change
    notifications (fakes in tests)."""
    router = APIRouter(prefix="/meetings", tags=["meetings"])
    events = db[EVENTS]
    state = db[STATE]
    watches = db[WATCHES]

    async def ical_fetch(url: str, time_min: str, time_max: str) -> List[dict]:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            res = await client.get(url)
        if res.status_code != 200:
            raise RuntimeError(f"The iCal link answered {res.status_code} (is the calendar shared / the link current?)")
        if b"BEGIN:VCALENDAR" not in res.content[:2000]:
            raise RuntimeError("The iCal link did not return a calendar")
        return await asyncio.to_thread(ical_to_events, res.content, time_min, time_max)

    async def google_fetch(calendar: str, time_min: str, time_max: str) -> List[dict]:
        if calendar in ical_urls():
            return await ical_fetch(ical_urls()[calendar], time_min, time_max)
        info = service_account_info()
        if not info:
            raise RuntimeError("Google Calendar is not connected (set CALENDAR_ICAL_URLS for this calendar, or GOOGLE_CALENDAR_SERVICE_ACCOUNT)")
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

    # ---- Google change notifications (push) ---------------------------------
    async def google_watch(calendar: str, body: dict) -> dict:
        info = service_account_info()
        token = await asyncio.to_thread(_access_token, info, calendar)
        async with httpx.AsyncClient(timeout=30) as client:
            res = await client.post(
                f"{API}/calendars/{quote(calendar)}/events/watch",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )
        if res.status_code != 200:
            raise RuntimeError(f"Google said {res.status_code}: {res.text[:300]}")
        return res.json()

    async def google_stop(calendar: str, body: dict) -> None:
        info = service_account_info()
        token = await asyncio.to_thread(_access_token, info, calendar)
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(
                f"{API}/channels/stop",
                json=body,
                headers={"Authorization": f"Bearer {token}"},
            )

    watch = watch_api or google_watch
    stop = stop_api or google_stop

    async def ensure_watch(calendar: str) -> Optional[str]:
        """Make sure Google will tell us when `calendar` changes. Returns an error
        text, or None when it is fine (or push is not available here)."""
        address = webhook_address()
        if not address or (watch_api is None and service_account_info() is None):
            return None
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        current = await watches.find_one({"calendar": calendar}, {"_id": 0})
        if (
            current
            and current.get("address") == address
            and int(current.get("expiration_ms") or 0) - now_ms > RENEW_BEFORE_HOURS * 3600 * 1000
        ):
            return None
        channel_id = uuid.uuid4().hex
        secret = secrets.token_urlsafe(32)
        try:
            res = await watch(calendar, {
                "id": channel_id,
                "type": "web_hook",
                "address": address,
                "token": secret,
                "params": {"ttl": str(CHANNEL_TTL_SECONDS)},
            })
        except Exception as exc:
            logger.warning("Calendar push subscription failed for %s: %s", calendar, exc)
            await watches.update_one(
                {"calendar": calendar}, {"$set": {"calendar": calendar, "last_error": str(exc)[:300]}}, upsert=True
            )
            return str(exc)[:300]
        await watches.replace_one({"calendar": calendar}, {
            "calendar": calendar,
            "channel_id": channel_id,
            "token": secret,
            "resource_id": res.get("resourceId") or "",
            "expiration_ms": int(res.get("expiration") or 0),
            "address": address,
            "created_at": now_iso(),
            "last_ping_at": (current or {}).get("last_ping_at"),
            "last_error": "",
        }, upsert=True)
        if current and current.get("channel_id"):
            try:  # the old channel would keep pinging until it expires
                await stop(calendar, {"id": current["channel_id"], "resourceId": current.get("resource_id") or ""})
            except Exception:
                pass
        return None

    async def ensure_watches() -> Dict[str, Optional[str]]:
        return {c: await ensure_watch(c) for c in calendar_ids()}

    # one sync at a time per calendar; pings that arrive meanwhile cause one more
    running: set = set()
    again: set = set()

    async def sync_soon(calendar: str):
        if calendar in running:
            again.add(calendar)
            return
        running.add(calendar)
        try:
            while True:
                again.discard(calendar)
                await sync_calendar(calendar)
                if calendar not in again:
                    return
        except Exception:
            logger.exception("Calendar sync after a push failed for %s", calendar)
        finally:
            running.discard(calendar)

    @router.post("/webhook")
    async def webhook(request: Request):
        """Google: "something in this calendar changed". No login (Google cannot
        have one), so the per-channel secret token is what is checked."""
        channel = request.headers.get("x-goog-channel-id") or ""
        given = request.headers.get("x-goog-channel-token") or ""
        row = await watches.find_one({"channel_id": channel}, {"_id": 0}) if channel else None
        if not row or not hmac.compare_digest(str(row.get("token") or ""), given):
            raise HTTPException(status_code=404, detail="Unknown channel")
        await watches.update_one({"channel_id": channel}, {"$set": {"last_ping_at": now_iso()}})
        # "sync" is only Google confirming the subscription; anything else is a change
        if (request.headers.get("x-goog-resource-state") or "") != "sync":
            asyncio.create_task(sync_soon(row["calendar"]))
        return Response(status_code=200)

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
        channels = {w["calendar"]: w for w in await watches.find({}, {"_id": 0}).to_list(100)}
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        def push(c: str) -> dict:
            w = channels.get(c) or {}
            return {
                "active": int(w.get("expiration_ms") or 0) > now_ms,
                "expires_at": (
                    datetime.fromtimestamp(int(w["expiration_ms"]) / 1000, timezone.utc).isoformat()
                    if w.get("expiration_ms") else None
                ),
                "last_ping_at": w.get("last_ping_at"),
                "error": w.get("last_error") or "",
            }

        return {
            "configured": is_connected() or fetch_events is not None,
            "calendars": [{"calendar": c, **states.get(c, {}), "push": push(c)} for c in calendar_ids()],
        }

    @router.post("/sync")
    async def sync_now(request: Request):
        user = await get_acting_user(request)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Only admins can start a sync")
        synced = await sync_all()
        await ensure_watches()
        return {"synced": synced}

    router.sync_all = sync_all  # for the background loop and tests
    router.ensure_watches = ensure_watches
    return router


async def calendar_sync_loop(
    sync_all: Callable[[], Awaitable[Dict[str, int]]],
    ensure_watches: Optional[Callable[[], Awaitable[Dict[str, Optional[str]]]]] = None,
):
    minutes = max(1.0, float(os.environ.get("CALENDAR_SYNC_MINUTES", "10")))
    while True:
        if is_connected():
            try:
                counts = await sync_all()
                logger.info("Calendar sync: %s", counts)
                if ensure_watches:
                    await ensure_watches()  # subscribe / renew Google's change notifications
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Calendar sync failed")
        await asyncio.sleep(minutes * 60)


async def ensure_meeting_indexes(db):
    await db[WATCHES].create_index("channel_id")
    await db[EVENTS].create_index("id")
    await db[EVENTS].create_index([("calendar", 1), ("start", 1)])
    await db[EVENTS].create_index([("start", 1), ("end", 1)])
