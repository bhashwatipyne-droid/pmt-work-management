"""Deliverable routes and project deletes (deliverables.py) on the real app."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import (  # noqa: E402,F401
    INVESCO_CONTRA,
    PHARMA_DELIVERABLE,
    PHARMA_PROJECT,
    env,
    run,
    server,
)


def api(env, method, path, user, body=None):
    c = env.as_user(user)
    kw = {"json": body} if body is not None else {}
    return getattr(c, method)("/api" + path, **kw)


def make(env, name="Reel", **extra):
    body = {"project_id": INVESCO_CONTRA, "name": name, "type": "Newsletters", "required_stages": ["Content", "Design"], **extra}
    r = api(env, "post", "/deliverables", "admin-1", body)
    assert r.status_code == 200, r.text
    return r.json()


def test_create_starts_at_first_stage_with_a_manager_approval_workflow(env):
    d = make(env)
    assert d["current_stage"] == "Content" and d["required_stages"] == ["Content", "Design"]
    wf = run(server.db.approval_workflows.find_one({"deliverable_id": d["id"]}))
    assert wf and "MANAGER" in wf["required_types"]
    assert run(server.db.deliverable_activity_log.count_documents({"deliverable_id": d["id"]})) >= 1


def test_only_admins_create_and_bad_input_is_refused(env):
    body = {"project_id": INVESCO_CONTRA, "name": "X", "required_stages": ["Content"]}
    assert api(env, "post", "/deliverables", "member-km", body).status_code == 403
    assert api(env, "post", "/deliverables", "admin-1", {**body, "required_stages": ["Nope"]}).status_code == 400
    assert api(env, "post", "/deliverables", "admin-1", {**body, "project_id": "none"}).status_code in (400, 404)


def test_list_filters_by_project(env):
    d = make(env)
    ids = [x["id"] for x in api(env, "get", f"/deliverables?project_id={INVESCO_CONTRA}", "member-km").json()]
    assert ids == [d["id"]]
    other = [x["id"] for x in api(env, "get", f"/deliverables?project_id={PHARMA_PROJECT}", "member-km").json()]
    assert PHARMA_DELIVERABLE in other and d["id"] not in other


def test_edit_renames_and_rejects_nonsense(env):
    d = make(env)
    r = api(env, "patch", f"/deliverables/{d['id']}", "admin-1", {"name": "Renamed"})
    assert r.status_code == 200 and r.json()["name"] == "Renamed"
    assert api(env, "patch", "/deliverables/none", "admin-1", {"name": "x"}).status_code == 404
    assert api(env, "patch", f"/deliverables/{d['id']}", "member-km", {"name": "x"}).status_code == 403
    assert api(env, "patch", f"/deliverables/{d['id']}", "admin-1", {"required_stages": ["Nope"]}).status_code == 400


def test_deleting_a_deliverable_removes_its_approvals(env):
    d = make(env)
    assert api(env, "delete", f"/deliverables/{d['id']}", "member-km").status_code == 403
    assert api(env, "delete", f"/deliverables/{d['id']}", "admin-1").status_code == 200
    assert run(server.db.deliverables.count_documents({"id": d["id"]})) == 0
    assert run(server.db.approval_workflows.count_documents({"deliverable_id": d["id"]})) == 0
    assert api(env, "delete", f"/deliverables/{d['id']}", "admin-1").status_code == 404


def test_deleting_a_project_keeps_work_rows_and_stamps_where_they_came_from(env):
    d = make(env)
    run(server.db.work_items.insert_one({
        "id": "w1", "project_id": INVESCO_CONTRA, "deliverable_id": d["id"], "creator_id": "member-km",
    }))
    assert api(env, "delete", f"/projects/{INVESCO_CONTRA}", "member-km").status_code == 403
    assert api(env, "delete", f"/projects/{INVESCO_CONTRA}", "admin-1").status_code == 200
    row = run(server.db.work_items.find_one({"id": "w1"}))
    assert row["project_id"] is None and row["deliverable_id"] is None
    assert row["deleted_project_id"] == INVESCO_CONTRA and row["deleted_project_code"] == "P3"
    assert run(server.db.projects.count_documents({"id": INVESCO_CONTRA})) == 0
    assert run(server.db.deliverables.count_documents({"project_id": INVESCO_CONTRA})) == 0
    assert run(server.db.approval_workflows.count_documents({"deliverable_id": d["id"]})) == 0
    assert run(server.db.project_activity_log.count_documents({"action": "PROJECT_DELETED"})) == 1


def test_bulk_delete_removes_each_project(env):
    r = api(env, "post", "/projects/bulk-delete", "admin-1", {"project_ids": [INVESCO_CONTRA, PHARMA_PROJECT]})
    assert r.status_code == 200, r.text
    assert run(server.db.projects.count_documents({"id": {"$in": [INVESCO_CONTRA, PHARMA_PROJECT]}})) == 0
