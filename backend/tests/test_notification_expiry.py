"""Unit tests for the daily expiry of old notifications (no live server).

Uses mongomock behind a tiny async wrapper so the real delete filter is
evaluated by a Mongo query engine. Skipped when mongomock is not installed.
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest

mongomock = pytest.importorskip("mongomock")

# notifications.py imports `backend.common`, so the repo root must be importable.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("MONGO_URL", "mongodb://localhost")
os.environ.setdefault("DB_NAME", "test")

import backend.notifications as notifications  # noqa: E402


class _AsyncCollection:
    def __init__(self, coll):
        self._c = coll

    async def delete_many(self, query):
        return self._c.delete_many(query)


def _days_ago(days):
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


@pytest.fixture
def coll(monkeypatch):
    raw = mongomock.MongoClient().db.notifications
    monkeypatch.setattr(notifications, "db", type("D", (), {"notifications": _AsyncCollection(raw)})())
    monkeypatch.setattr(notifications, "_last_notification_cleanup", None)
    return raw


def _add(coll, key, days, read):
    coll.insert_one({
        "id": key, "user_id": "u1", "dedupe_key": key,
        "created_at": _days_ago(days),
        "read_at": _days_ago(days) if read else None,
    })


def test_expires_old_read_and_very_old_notices_only(coll):
    _add(coll, "new-project:a", 10, read=True)        # recent read: kept
    _add(coll, "new-project:b", 90, read=True)        # old read: deleted
    _add(coll, "new-project:c", 90, read=False)       # old but unread: kept
    _add(coll, "new-project:d", 200, read=False)      # very old unread: deleted
    _add(coll, "worksheet-inactivity:u1:2026-01-01", 90, read=True)  # deleted

    asyncio.run(notifications._expire_old_notifications())

    kept = sorted(d["id"] for d in coll.find())
    assert kept == ["new-project:a", "new-project:c"]


def test_scan_rebuilt_notices_are_never_expired(coll):
    _add(coll, "project-overdue:p1:2026-01-01:u1", 400, read=True)
    _add(coll, "deliverable-overdue:d1:Design:2026-01-01:u1", 400, read=True)
    _add(coll, "approval-stuck:i1:2026-01-01T00:00:00:u1", 400, read=True)

    asyncio.run(notifications._expire_old_notifications())

    assert coll.count_documents({}) == 3


def test_runs_at_most_once_a_day(coll):
    _add(coll, "new-project:b", 90, read=True)
    asyncio.run(notifications._expire_old_notifications())
    assert coll.count_documents({}) == 0

    _add(coll, "new-project:z", 90, read=True)
    asyncio.run(notifications._expire_old_notifications())
    assert coll.count_documents({}) == 1  # second run skipped by the throttle
