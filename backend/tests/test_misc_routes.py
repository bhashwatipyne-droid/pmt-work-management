"""Dashboard, notification and lookup routes on the real app and an in-memory database."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import INVESCO_CLIENT, INVESCO_CONTRA, PHARMA_DELIVERABLE, PHARMA_PROJECT, env, run, server  # noqa: E402,F401


def api(env, method, path, user, body=None):
    c = env.as_user(user)
    kw = {"json": body} if body is not None else {}
    return getattr(c, method)("/api" + path, **kw)


# ----------------------------------------------------------------- lookups
def test_config_options_list_the_fixed_choices(env):
    body = env.get("/config/options", "member-km").json()
    for key in ("deliverable_types", "statuses", "stages", "project_statuses", "roles", "departments", "client_statuses"):
        assert body[key], key


def test_worksheet_lookups_return_names_only_and_skip_hidden_projects(env):
    run(server.db.projects.update_one({"id": INVESCO_CONTRA}, {"$set": {"hidden": True}}))
    data = env.get("/worksheet/lookups", "member-km").json()
    assert {c["id"] for c in data["clients"]} == {"CLIENT - 006", INVESCO_CLIENT}
    assert INVESCO_CONTRA not in {p["id"] for p in data["projects"]}
    assert PHARMA_PROJECT in {p["id"] for p in data["projects"]}
    assert {d["id"] for d in data["deliverables"]} == {PHARMA_DELIVERABLE}
    assert set(data["clients"][0]) == {"id", "name"}
    assert env.get("/worksheet/lookups", "ghost").status_code == 401


def test_deliverable_names_are_grouped_by_project_in_lowercase(env):
    names = env.get("/worksheet/deliverable-names", "member-km").json()
    assert names[PHARMA_PROJECT] == ["from lab to life - product explainer"]


# ----------------------------------------------------------- notifications
def seed_notice(user="member-km", **extra):
    doc = {"id": "n1", "user_id": user, "title": "Hello", "message": "x", "read_at": None,
           "created_at": "2026-10-21T00:00:00+00:00", **extra}
    run(server.db.notifications.insert_one(doc))


def test_notifications_list_mark_read_and_read_all(env):
    seed_notice()
    seed_notice(id="n2")
    seed_notice("member-rb", id="n3")
    listing = env.get("/notifications", "member-km")
    assert listing.status_code == 200, listing.text
    ids = {n["id"] for n in (listing.json()["notifications"] if isinstance(listing.json(), dict) else listing.json())}
    assert {"n1", "n2"} <= ids and "n3" not in ids
    assert env.post("/notifications/n1/read", "member-km").status_code == 200
    assert run(server.db.notifications.find_one({"id": "n1"}))["read_at"]
    assert env.post("/notifications/n3/read", "member-km").status_code == 404
    assert env.post("/notifications/read-all", "member-km").status_code == 200
    assert run(server.db.notifications.count_documents({"user_id": "member-km", "read_at": None})) == 0
    assert run(server.db.notifications.count_documents({"user_id": "member-rb", "read_at": None})) == 1


def test_push_token_register_and_unregister(env):
    token = "t" * 40
    assert env.post("/push/register", "member-km", {"token": token}).status_code == 200
    assert run(server.db.push_tokens.find_one({"token": token}))["user_id"] == "member-km"
    assert env.post("/push/register", "member-rb", {"token": token}).status_code == 200
    assert run(server.db.push_tokens.find_one({"token": token}))["user_id"] == "member-rb"
    assert env.post("/push/register", "member-km", {"token": "short"}).status_code == 422
    assert env.post("/push/unregister", "member-rb", {"token": token}).status_code == 200
    assert run(server.db.push_tokens.count_documents({"token": token})) == 0


def test_add_row_from_a_notification_creates_one_row_once(env):
    seed_notice(action_type="add_work_row", project_id=PHARMA_PROJECT, deliverable_id=PHARMA_DELIVERABLE, stage="Content")
    assert env.post("/notifications/n1/add-row", "admin-1").status_code == 403
    first = env.post("/notifications/n1/add-row", "member-km")
    assert first.status_code == 200, first.text
    assert run(server.db.work_items.count_documents({"creator_id": "member-km"})) == 1
    assert env.post("/notifications/n1/add-row", "member-km").status_code == 409
    assert env.post("/notifications/none/add-row", "member-km").status_code == 404


# --------------------------------------------------------------- dashboard
@pytest.mark.parametrize("path", ["/dashboard/summary", "/dashboard/team-summary", "/dashboard/attention-items", "/dashboard/overview"])
def test_dashboard_is_admin_only_and_answers(env, path):
    assert env.get(path, "member-km").status_code == 403
    assert env.get(path, "admin-1").status_code == 200
