"""Ready to invoice: a project with deliverables but no work-sheet rows (brought over
from the old sheet or merged) must still list its pieces, not show 0 / 0 / 0."""
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

from invoicing import create_invoicing_router  # noqa: E402


@pytest.fixture
def client():
    db = AsyncMongoMockClient()["t"]
    app = FastAPI()

    async def acting(request):
        return SimpleNamespace(id="hr1", role="hr")

    async def noop(*a, **k):
        return None

    app.include_router(create_invoicing_router(db, acting, noop, lambda: "now", noop))
    return db, TestClient(app)


def _seed(db):
    import asyncio

    async def go():
        await db.clients.insert_one({"id": "C1", "name": "ABSL", "contact_persons": []})
        await db.projects.insert_many([
            {"id": "p-old", "name": "Merged", "client_id": "C1", "status": "Raised Invoice", "status_changed_at": "2026-10-08T09:00:00+00:00"},
            {"id": "p-new", "name": "Tracked", "client_id": "C1", "status": "Raised Invoice", "status_changed_at": "2026-10-08T09:00:00+00:00"},
        ])
        await db.deliverables.insert_many([
            {"id": "D1", "project_id": "p-old", "name": "LargeCap video", "type": "AV", "current_stage": "Content"},
            {"id": "D2", "project_id": "p-old", "name": "Poster", "type": "Static", "current_stage": "Design"},
            {"id": "D3", "project_id": "p-new", "name": "Should be ignored", "type": "AV", "current_stage": "Content"},
        ])
        await db.work_items.insert_one(
            {"id": "W1", "project_id": "p-new", "stage": "Design", "quantity": 2, "time_taken_minutes": 30,
             "deliverable_name": "Real work", "status": "Done"})

    asyncio.get_event_loop_policy().new_event_loop().run_until_complete(go())


def test_projects_without_work_rows_list_their_deliverables(client):
    db, c = client
    _seed(db)
    rows = {p["id"]: p for p in c.get("/invoicing/projects?tab=raised").json()["projects"]}
    assert rows["p-old"]["counts"] == {"Content": 1, "Design": 1, "Animation": 0}
    # a project that has real work rows keeps using them, never the deliverables
    assert rows["p-new"]["counts"] == {"Content": 0, "Design": 2, "Animation": 0}


def test_detail_shows_deliverable_lines(client):
    db, c = client
    _seed(db)
    d = c.get("/invoicing/projects/p-old").json()
    assert sorted(l["name"] for l in d["lines"]) == ["LargeCap video", "Poster"]
