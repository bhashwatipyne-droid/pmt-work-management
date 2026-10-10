"""Sharing a project as a link with a WhatsApp preview.

Runs the real FastAPI app against an in-memory MongoDB (no network, no server):

    cd backend && pytest tests/test_project_share.py -n 0 -p no:cacheprovider

Needs: pip install mongomock-motor pillow
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pmt_share_test")
os.environ.setdefault("JWT_SECRET", "share-test-secret")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import jwt  # noqa: E402
import motor.motor_asyncio as _motor  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

_real_client = _motor.AsyncIOMotorClient
_motor.AsyncIOMotorClient = AsyncMongoMockClient
try:
    import server  # noqa: E402
finally:
    _motor.AsyncIOMotorClient = _real_client

import project_share  # noqa: E402

PROJECT = "proj-1"
PNG = b"\x89PNG\r\n\x1a\n"


def run(coro):
    return asyncio.run(coro)


def token_for(user_id):
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )


USERS = [
    {"id": "admin-1", "name": "Gaurav Mody", "role": "admin", "department": "Administration"},
    {"id": "manager-1", "name": "Harshal Pawar", "role": "manager", "department": "Content"},
    {"id": "member-1", "name": "Ratnesh Bor", "role": "member", "department": "Content"},
]


def deliverable(n, status="Not Started", **over):
    row = {
        "id": f"d{n}", "project_id": PROJECT, "name": f"Deliverable {n}", "type": "Carousel",
        "current_stage": "Design", "stage_status": status, "end_dt": f"2026-10-{n:02d}",
        "created_at": f"2026-09-{n:02d}T00:00:00+00:00",
    }
    row.update(over)
    return row


@pytest.fixture()
def env():
    async def reset():
        for name in await server.db.list_collection_names():
            await server.db[name].delete_many({})
        await server.db.users.insert_many([dict(u, active=True, email=f"{u['id']}@x.test") for u in USERS])
        await server.db.clients.insert_one({"id": "c1", "name": "ICICI Prudential MF", "status": "Active"})
        await server.db.projects.insert_one({
            "id": PROJECT, "name": "Contra <Fund> & Co", "client_id": "c1", "status": "Active", "hidden": False,
            "start_date": "2026-09-01", "end_date": "2026-10-31", "code": "P1",
            "created_at": "2026-01-01T00:00:00+00:00", "updated_at": "2026-01-01T00:00:00+00:00",
        })
        await server.db.deliverables.insert_many([
            deliverable(3, "Completed"), deliverable(1, "In Progress"), deliverable(2),
        ])

    run(reset())
    server._user_cache.clear()
    api = TestClient(server.app)

    class Env:
        def as_user(self, user_id):
            api.headers.pop("Authorization", None)
            if user_id:
                api.headers["Authorization"] = f"Bearer {token_for(user_id)}"
            return api

        def start(self, user_id="manager-1"):
            return self.as_user(user_id).post(f"/api/projects/{PROJECT}/share")

        def public(self, path):
            return self.as_user(None).get(path)

    return Env()


def token_of(url):
    return url.split("/api/share/p/")[1].split("?")[0]


def test_a_manager_starts_sharing_and_gets_a_link(env):
    body = env.start().json()
    assert body["active"] is True
    assert "/api/share/p/" in body["url"] and body["url"].count("?v=") == 1
    assert "/preview.png" in body["preview_url"]


def test_asking_again_gives_the_same_token(env):
    first, second = env.start().json(), env.start("admin-1").json()
    assert token_of(first["url"]) == token_of(second["url"])


def test_members_cannot_share_and_status_needs_sign_in(env):
    assert env.start("member-1").status_code == 403
    assert env.as_user("member-1").get(f"/api/projects/{PROJECT}/share").status_code == 403
    assert env.as_user(None).post(f"/api/projects/{PROJECT}/share").status_code == 401


def test_status_reports_whether_it_is_shared(env):
    assert env.as_user("manager-1").get(f"/api/projects/{PROJECT}/share").json() == {"active": False}
    env.start()
    assert env.as_user("manager-1").get(f"/api/projects/{PROJECT}/share").json()["active"] is True


def test_a_missing_or_hidden_project_cannot_be_shared(env):
    assert env.as_user("manager-1").post("/api/projects/nope/share").status_code == 404
    run(server.db.projects.update_one({"id": PROJECT}, {"$set": {"hidden": True}}))
    assert env.start().status_code == 404


def test_the_link_opens_without_signing_in_and_carries_the_preview_tags(env):
    url = env.start().json()["url"]
    token = token_of(url)
    page = env.public(f"/api/share/p/{token}?v=123")
    assert page.status_code == 200
    text = page.text
    # Contra <Fund> & Co is escaped everywhere it is printed
    assert "<Fund>" not in text and "Contra &lt;Fund&gt; &amp; Co" in text
    assert '<meta property="og:title" content="Contra &lt;Fund&gt; &amp; Co">' in text
    assert "ICICI Prudential MF · 1 of 3 deliverables done · Active" in text
    assert f"/api/share/p/{token}/preview.png?v=123" in text
    assert 'name="robots" content="noindex, nofollow"' in text


def test_the_page_lists_deliverables_by_due_date_and_shows_nothing_else(env):
    run(server.db.deliverables.update_one({"id": "d1"}, {"$set": {"last_review_note": "secret note", "link": "http://x"}}))
    token = token_of(env.start().json()["url"])
    text = env.public(f"/api/share/p/{token}").text
    assert text.index("Deliverable 1") < text.index("Deliverable 2") < text.index("Deliverable 3")
    assert "secret note" not in text and "http://x" not in text
    assert "Done" in text and "In progress" in text and "Not started" in text


def test_the_preview_image_is_a_png(env):
    pytest.importorskip("PIL")
    token = token_of(env.start().json()["url"])
    img = env.public(f"/api/share/p/{token}/preview.png")
    assert img.status_code == 200 and img.headers["content-type"] == "image/png"
    assert img.content.startswith(PNG)
    from PIL import Image
    import io
    assert Image.open(io.BytesIO(img.content)).size == (1200, 630)


def test_stopping_sharing_kills_the_link_and_a_new_one_is_different(env):
    first = token_of(env.start().json()["url"])
    assert env.as_user("manager-1").delete(f"/api/projects/{PROJECT}/share").json() == {"active": False}
    assert env.public(f"/api/share/p/{first}").status_code == 404
    assert env.public(f"/api/share/p/{first}/preview.png").status_code == 404
    again = token_of(env.start().json()["url"])
    assert again != first
    assert env.public(f"/api/share/p/{again}").status_code == 200


def test_a_guessed_token_or_a_hidden_project_shows_nothing(env):
    assert env.public("/api/share/p/not-a-token").status_code == 404
    token = token_of(env.start().json()["url"])
    run(server.db.projects.update_one({"id": PROJECT}, {"$set": {"hidden": True}}))
    assert env.public(f"/api/share/p/{token}").status_code == 404


def test_a_project_with_no_deliverables_still_shares(env):
    run(server.db.deliverables.delete_many({}))
    token = token_of(env.start().json()["url"])
    assert "No deliverables yet" in env.public(f"/api/share/p/{token}").text


def test_the_public_base_url_can_be_configured(env, monkeypatch):
    monkeypatch.setenv("PUBLIC_API_URL", "https://api.example.com/")
    assert env.start().json()["url"].startswith("https://api.example.com/api/share/p/")


def test_share_data_and_wording():
    project = {"name": "P", "status": "Active", "start_date": "2026-09-01", "end_date": "2026-10-31"}
    data = project_share.build_share_data(project, "Client", [deliverable(2), deliverable(1, "Closed")])
    assert [r["name"] for r in data["rows"]] == ["Deliverable 1", "Deliverable 2"]
    assert (data["done"], data["total"]) == (1, 2)
    assert data["timeline"] == "1 Sep 2026 – 31 Oct 2026"
    assert project_share.summary_text(data) == "Client · 1 of 2 deliverables done · Active"
    assert data["rows"][0]["due"] == "1 Oct 2026"
