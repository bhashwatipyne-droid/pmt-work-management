"""Project write routes (projects_write.py) on the real app and an in-memory database."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import INVESCO_CLIENT, INVESCO_CONTRA, env, run, server  # noqa: E402,F401


def post(env, path, user, body=None):
    return env.post(path, user, body)


def patch(env, path, user, body):
    return env.as_user(user).patch("/api" + path, json=body)


def test_only_admins_create_projects(env):
    assert post(env, "/projects", "member-km", {"name": "X", "client_id": INVESCO_CLIENT}).status_code == 403


def test_create_stores_the_project_with_a_code_and_lists_it(env):
    r = post(env, "/projects", "admin-1", {"name": "Fresh Launch", "client_id": INVESCO_CLIENT})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["name"] == "Fresh Launch" and body["client_id"] == INVESCO_CLIENT and body["code"]
    ids = [p["id"] for p in env.get("/projects", "member-km").json()]
    assert body["id"] in ids


def test_create_with_unknown_client_is_refused(env):
    assert post(env, "/projects", "admin-1", {"name": "X", "client_id": "nope"}).status_code in (400, 404)


def test_edit_changes_fields_and_validates_status(env):
    ok = patch(env, f"/projects/{INVESCO_CONTRA}", "admin-1", {"description": "Oct edition"})
    assert ok.status_code == 200 and ok.json()["description"] == "Oct edition"
    assert patch(env, f"/projects/{INVESCO_CONTRA}", "admin-1", {"status": "Bogus"}).status_code == 400
    assert patch(env, "/projects/none", "admin-1", {"description": "x"}).status_code == 404
    assert patch(env, f"/projects/{INVESCO_CONTRA}", "member-km", {"description": "x"}).status_code == 403


def test_hide_and_unhide_move_a_project_in_and_out_of_the_member_list(env):
    assert post(env, f"/projects/{INVESCO_CONTRA}/hide", "admin-1").status_code == 200
    assert INVESCO_CONTRA not in [p["id"] for p in env.get("/projects", "member-km").json()]
    assert INVESCO_CONTRA in [p["id"] for p in env.get("/projects?visibility=hidden", "admin-1").json()]
    assert post(env, f"/projects/{INVESCO_CONTRA}/unhide", "admin-1").status_code == 200
    assert INVESCO_CONTRA in [p["id"] for p in env.get("/projects", "member-km").json()]
    assert post(env, f"/projects/{INVESCO_CONTRA}/hide", "member-km").status_code == 403


def test_bulk_hide_and_unhide(env):
    ids = [INVESCO_CONTRA]
    assert post(env, "/projects/bulk-hide", "admin-1", {"project_ids": ids}).status_code == 200
    assert run(server.db.projects.find_one({"id": INVESCO_CONTRA}))["hidden"] is True
    assert post(env, "/projects/bulk-unhide", "admin-1", {"project_ids": ids}).status_code == 200
    assert run(server.db.projects.find_one({"id": INVESCO_CONTRA}))["hidden"] is False


def test_bulk_status_changes_every_project_and_rejects_a_bad_status(env):
    ids = [INVESCO_CONTRA]
    assert post(env, "/projects/bulk-status", "admin-1", {"project_ids": ids, "status": "Bogus"}).status_code == 400
    r = post(env, "/projects/bulk-status", "admin-1", {"project_ids": ids, "status": "On Hold"})
    assert r.status_code == 200 and r.json()["count"] == 1
    assert run(server.db.projects.find_one({"id": INVESCO_CONTRA}))["status"] == "On Hold"
