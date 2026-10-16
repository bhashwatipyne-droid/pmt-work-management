"""Meetings (Google Calendar sync), with Google replaced by a fake:

    cd backend && pytest tests/test_meetings.py -n 0 -p no:cacheprovider
"""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import env, run, server  # noqa: E402,F401

import meetings  # noqa: E402

CAL = "projects@finace.co"


def event(eid, start, end, **extra):
    return {"id": eid, "iCalUID": f"{eid}@google.com", "status": "confirmed",
            "start": {"dateTime": start}, "end": {"dateTime": end}, **extra}


def make_router(google):
    async def fetch(calendar, time_min, time_max):
        if isinstance(google.get(calendar), Exception):
            raise google[calendar]
        return google.get(calendar, [])
    return meetings.create_meetings_router(
        server.db, server.get_acting_user, server.now_iso, fetch_events=fetch
    )


@pytest.fixture(autouse=True)
def only_one_calendar(monkeypatch):
    monkeypatch.setenv("CALENDAR_IDS", CAL)


def test_sync_stores_events_and_the_page_reads_them(env):
    google = {CAL: [
        event("a1", "2026-10-15T11:30:00+05:30", "2026-10-15T12:00:00+05:30",
              summary="Pharma ETF NFO call", hangoutLink="https://meet.google.com/abc",
              attendees=[{"email": "Projects@finace.co", "responseStatus": "accepted"},
                         {"email": "rahul@icicipruamc.com", "displayName": "Rahul"}]),
        {"id": "gone", "status": "cancelled"},
    ]}
    assert run(make_router(google).sync_all()) == {CAL: 1}

    run(server.db.clients.update_one({"id": "CLIENT - 006"},
        {"$set": {"contact_persons": [{"id": "c1", "name": "Rahul", "email": "rahul@icicipruamc.com"}]}}))

    res = env.get("/meetings?start=2026-10-12&end=2026-10-19", "member-rb")
    assert res.status_code == 200, res.text
    (m,) = res.json()
    assert m["summary"] == "Pharma ETF NFO call" and m["calendar"] == CAL
    assert m["meet_link"] == "https://meet.google.com/abc"
    assert m["my_response"] == "accepted"
    assert m["client"] == {"id": "CLIENT - 006", "name": "ICICI Prudential Mutual Fund"}

    assert env.get("/meetings?start=2026-10-20&end=2026-10-27", "member-rb").json() == []


def test_a_meeting_deleted_in_google_disappears_on_the_next_sync(env):
    from datetime import datetime, timedelta, timezone
    soon = (datetime.now(timezone.utc) + timedelta(days=2)).replace(microsecond=0)
    google = {CAL: [event("x", soon.isoformat(), (soon + timedelta(hours=1)).isoformat())]}
    router = make_router(google)
    run(router.sync_all())
    assert run(server.db.calendar_events.count_documents({})) == 1
    google[CAL] = []
    run(router.sync_all())
    assert run(server.db.calendar_events.count_documents({})) == 0


def test_private_events_only_show_as_busy(env):
    google = {CAL: [event("p", "2026-10-15T15:00:00+05:30", "2026-10-15T16:00:00+05:30",
                          summary="Doctor", description="secret", visibility="private",
                          attendees=[{"email": "x@y.com"}])]}
    run(make_router(google).sync_all())
    (m,) = env.get("/meetings?start=2026-10-15&end=2026-10-16", "member-rb").json()
    assert m["summary"] == "Busy" and m["description"] == "" and m["attendees"] == []


def test_all_day_events_and_a_failed_calendar_are_reported(env):
    google = {CAL: [{"id": "d", "status": "confirmed", "summary": "Diwali",
                     "start": {"date": "2026-11-08"}, "end": {"date": "2026-11-09"}}]}
    run(make_router(google).sync_all())
    (m,) = env.get("/meetings?start=2026-11-08&end=2026-11-09", "member-rb").json()
    assert m["all_day"] is True and m["start"] == "2026-11-08"

    run(make_router({CAL: RuntimeError("Google said 403: not authorized")}).sync_all())
    status = env.get("/meetings/status", "member-rb").json()
    (cal,) = status["calendars"]
    assert cal["calendar"] == CAL and "403" in cal["last_error"]
    # the last good copy is kept
    assert run(server.db.calendar_events.count_documents({})) == 1


def test_hr_cannot_see_meetings_and_only_admins_start_a_sync(env):
    assert env.get("/meetings/status", "hr-1").status_code == 403
    assert env.post("/meetings/sync", "member-rb").status_code == 403


# --- iCal links (no Google Cloud project needed) ---------------------------
ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//test//EN
BEGIN:VEVENT
UID:one@google.com
DTSTART:20261015T060000Z
DTEND:20261015T063000Z
SUMMARY:Pharma ETF NFO call
DESCRIPTION:Join https://meet.google.com/abc-defg-hij
ORGANIZER;CN=Projects:mailto:projects@finace.co
ATTENDEE;CN=Rahul;PARTSTAT=ACCEPTED:mailto:rahul@icicipruamc.com
END:VEVENT
BEGIN:VEVENT
UID:weekly@google.com
DTSTART:20261012T040000Z
DTEND:20261012T043000Z
RRULE:FREQ=WEEKLY;COUNT=3
SUMMARY:Weekly sync
END:VEVENT
BEGIN:VEVENT
UID:allday@google.com
DTSTART;VALUE=DATE:20261016
DTEND;VALUE=DATE:20261017
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:secret@google.com
DTSTART:20261016T050000Z
DTEND:20261016T060000Z
CLASS:PRIVATE
SUMMARY:Doctor
END:VEVENT
BEGIN:VEVENT
UID:cancelled@google.com
DTSTART:20261017T050000Z
DTEND:20261017T060000Z
STATUS:CANCELLED
SUMMARY:Cancelled call
END:VEVENT
END:VCALENDAR
"""


def test_ical_events_become_the_same_documents_as_google_events():
    raw = meetings.ical_to_events(ICS, "2026-10-01T00:00:00+00:00", "2026-11-30T00:00:00+00:00")
    docs = {d["ical_uid"]: d for d in (meetings.to_doc(CAL, e, "t") for e in raw) if d}
    one = docs["one@google.com"]
    assert one["summary"] == "Pharma ETF NFO call" and not one["recurring"]
    assert one["meet_link"] == "https://meet.google.com/abc-defg-hij"
    assert one["attendees"][0] == {"email": "rahul@icicipruamc.com", "name": "Rahul",
                                   "response": "accepted", "organizer": False}
    weekly = [d for d in (meetings.to_doc(CAL, e, "t") for e in raw) if d and d["summary"] == "Weekly sync"]
    assert len(weekly) == 3 and len({d["id"] for d in weekly}) == 3 and weekly[0]["recurring"]
    assert docs["allday@google.com"]["all_day"] is True
    assert docs["secret@google.com"]["summary"] == "Busy"
    assert "cancelled@google.com" not in docs


def test_ical_links_are_read_per_calendar(monkeypatch):
    monkeypatch.setenv("CALENDAR_ICAL_URLS", f"{CAL}=https://example.com/a.ics, bad entry")
    assert meetings.ical_urls() == {CAL: "https://example.com/a.ics"}
    assert meetings.is_connected()
