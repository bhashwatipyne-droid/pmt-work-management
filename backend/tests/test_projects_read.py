"""Project read routes (projects_read.py), on an in-memory database."""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import project_duplicates  # noqa: E402
from projects_read import create_projects_read_router  # noqa: E402


def _run(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def env():
    db = AsyncMongoMockClient()["t"]

    async def get_acting_user(request: Request):
        if request.headers.get("x-role") is None:
            raise HTTPException(status_code=401, detail="no")
        return type("U", (), {"id": "u1", "role": request.headers["x-role"]})()

    async def require_admin(request: Request):
        user = await get_acting_user(request)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="admin only")
        return user

    async def cached_read(key, compute, ttl=None):
        return await compute()

    def search_clauses(search, fields):
        return [{"$or": [{f: {"$regex": w, "$options": "i"}} for f in fields]} for w in search.split()]

    app = FastAPI()
    app.include_router(
        create_projects_read_router(db, get_acting_user, require_admin, cached_read, search_clauses, 5000, project_duplicates)
    )
    return TestClient(app), db


ADMIN = {"x-role": "admin"}
MEMBER = {"x-role": "member"}


def seed(db):
    now = datetime.now(timezone.utc)
    soon = (now + timedelta(days=2)).date().isoformat()
    _run(db.clients.insert_one({"id": "c1", "name": "Acme", "contact_persons": [{"id": "k1", "name": "Ann"}]}))
    _run(db.projects.insert_many([
        {"id": "p1", "name": "Alpha", "code": "A-1", "client_id": "c1", "poc_id": "k1", "status": "Active",
         "end_date": soon, "created_at": "2026-01-02"},
        {"id": "p2", "name": "Beta", "code": "B-1", "client_id": "c1", "status": "Completed", "hidden": True,
         "end_date": soon, "created_at": "2026-01-01"},
    ]))
    _run(db.deliverables.insert_many([
        {"id": "d1", "project_id": "p1", "name": "Post", "current_stage": "Design"},
        {"id": "d2", "project_id": "p1", "name": "Reel", "current_stage": "Design"},
    ]))
    _run(db.work_items.insert_many([
        {"id": "w1", "project_id": "p1", "time_taken_minutes": 30, "work_date": "2026-02-01", "created_at": "1"},
        {"id": "w2", "project_id": "x", "deliverable_id": "d1", "time_taken_minutes": 15, "work_date": "2026-02-02", "created_at": "2"},
    ]))


def test_list_hides_hidden_projects_from_non_admins_and_adds_counts(env):
    c, db = env
    seed(db)
    rows = c.get("/projects", headers=MEMBER).json()
    assert [r["id"] for r in rows] == ["p1"]
    assert rows[0]["deliverables_count"] == 2 and rows[0]["stage_counts"]["Design"] == 2
    assert rows[0]["client_name"] == "Acme" and rows[0]["client_poc"] == "Ann"
    assert c.get("/projects?visibility=hidden", headers=MEMBER).json()[0]["id"] == "p1"
    assert [r["id"] for r in c.get("/projects?visibility=hidden", headers=ADMIN).json()] == ["p2"]
    assert c.get("/projects?visibility=bogus", headers=ADMIN).status_code == 400
    assert c.get("/projects").status_code == 401


def test_detail_includes_deliverables_and_404s(env):
    c, db = env
    seed(db)
    p = c.get("/projects/p1", headers=MEMBER).json()
    assert {d["id"] for d in p["deliverables"]} == {"d1", "d2"}
    assert c.get("/projects/none", headers=MEMBER).status_code == 404


def test_metrics_are_not_mistaken_for_a_project_id(env):
    c, db = env
    seed(db)
    m = c.get("/projects/metrics", headers=MEMBER).json()
    assert m == {"active_projects": 1, "in_rework": 0, "due_this_week": 1, "total_deliverables": 2}


def test_work_log_counts_rows_found_through_deliverables(env):
    c, db = env
    seed(db)
    r = c.get("/projects/p1/work-log", headers=MEMBER).json()
    assert r["total"] == 2 and r["total_minutes"] == 45
    assert [i["id"] for i in r["items"]] == ["w2", "w1"]


def test_duplicate_check_is_admin_only_and_finds_a_recent_same_name(env):
    c, db = env
    today = datetime.now(timezone.utc).date().isoformat()
    _run(db.projects.insert_one({"id": "p9", "name": "Brochure", "client_id": "c1", "created_at": today}))
    assert c.get("/projects/duplicate-check?client_id=c1&name=Brochure", headers=MEMBER).status_code == 403
    r = c.get("/projects/duplicate-check?client_id=c1&name=brochure", headers=ADMIN).json()
    assert [d["id"] for d in r["duplicates"]] == ["p9"]
