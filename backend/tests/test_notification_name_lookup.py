"""Unit test: the notification list should not look up deliverable names on
every request for old notifications that were saved without one.

Uses mongomock behind a tiny async wrapper (skipped if it isn't installed).
"""
import asyncio
import os
import sys
from types import SimpleNamespace

import pytest

mongomock = pytest.importorskip("mongomock")

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from backend import notification_routes  # noqa: E402


class _Cursor:
    def __init__(self, cur):
        self.cur = cur

    def sort(self, *args):
        self.cur = self.cur.sort(*args)
        return self

    async def to_list(self, n):
        return list(self.cur.limit(n))


class _Coll:
    def __init__(self, coll, counter=None):
        self.c = coll
        self.counter = counter

    def find(self, *args, **kwargs):
        if self.counter is not None:
            self.counter["finds"] += 1
        return _Cursor(self.c.find(*args, **kwargs))

    async def bulk_write(self, ops, ordered=False):
        # mongomock's bulk_write is not compatible with this pymongo version, so
        # apply each UpdateOne (filter + update) directly.
        for op in ops:
            self.c.update_one(op._filter, op._doc)


@pytest.fixture
def env():
    notification_routes._NAME_CACHE.clear()
    raw = mongomock.MongoClient().db
    raw.deliverables.insert_many([{"id": "d1", "name": "Carousel A"}])
    raw.notifications.insert_many([
        {"id": "n1", "user_id": "u1", "created_at": "2026-10-02", "deliverable_id": "d1"},
        {"id": "n2", "user_id": "u1", "created_at": "2026-10-01", "deliverable_id": "gone"},
        {"id": "n3", "user_id": "u1", "created_at": "2026-09-30", "deliverable_id": "d1", "deliverable_name": "Kept"},
    ])
    counter = {"finds": 0}
    db = SimpleNamespace(
        notifications=_Coll(raw.notifications),
        deliverables=_Coll(raw.deliverables, counter),
    )
    router = notification_routes.create_notification_router(
        db=db,
        DELIVERABLE_TYPE_CATEGORIES={},
        DEPARTMENT_TO_STAGE={},
        WorkItem=None,
        _APPROVAL_NOTICE_QUERY={"$or": [{"type": "stage_handoff"}]},
        _start_notification_scans=lambda: None,
        can_user_create_stage=None,
        get_acting_user=lambda request: _user(),
        get_time_benchmark=None,
        now_iso=lambda: "",
        validate_work_category_rules=None,
    )
    endpoint = next(r.endpoint for r in router.routes if r.path == "/notifications" and "GET" in r.methods)
    return raw, counter, endpoint


async def _user():
    return SimpleNamespace(id="u1", role="member")


def _call(endpoint):
    async def run():
        resp = await endpoint(SimpleNamespace(headers={}), limit=50)
        await asyncio.sleep(0.05)  # let the background write-back finish
        return resp
    return asyncio.run(run())


def test_names_filled_in_and_looked_up_only_once(env):
    import json
    raw, counter, endpoint = env

    rows = {r["id"]: r for r in json.loads(_call(endpoint).body)}
    assert rows["n1"]["deliverable_name"] == "Carousel A"
    assert rows["n2"]["deliverable_name"] == ""          # deleted deliverable
    assert rows["n3"]["deliverable_name"] == "Kept"       # untouched
    assert counter["finds"] == 1

    _call(endpoint)
    assert counter["finds"] == 1  # second request: no deliverables lookup at all


def test_found_names_are_saved_back_to_the_notification(env):
    raw, _, endpoint = env
    _call(endpoint)
    assert raw.notifications.find_one({"id": "n1"})["deliverable_name"] == "Carousel A"
    # the deleted deliverable's notice stays as it was
    assert not raw.notifications.find_one({"id": "n2"}).get("deliverable_name")
