"""Approval routes (approvals.py) on the real app and an in-memory database."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import INVESCO_CONTRA, env, run, server  # noqa: E402,F401


def api(env, method, path, user, body=None):
    c = env.as_user(user)
    kw = {"json": body} if body is not None else {}
    return getattr(c, method)("/api" + path, **kw)


def make(env, **extra):
    body = {"project_id": INVESCO_CONTRA, "name": "Reel", "type": "Newsletters",
            "required_stages": ["Content", "Design"], **extra}
    r = api(env, "post", "/deliverables", "admin-1", body)
    assert r.status_code == 200, r.text
    return r.json()


def stage_of(d_id):
    return run(server.db.deliverables.find_one({"id": d_id}))


def test_workflow_can_be_read_and_reconfigured_by_an_admin(env):
    d = make(env)
    r = api(env, "get", f"/deliverables/{d['id']}/approvals", "admin-1")
    assert r.status_code == 200, r.text
    assert api(env, "put", f"/deliverables/{d['id']}/approval-workflow", "member-km", {"approval_types": ["LEADERSHIP"]}).status_code == 403
    ok = api(env, "put", f"/deliverables/{d['id']}/approval-workflow", "admin-1", {"approval_types": ["LEADERSHIP"]})
    assert ok.status_code == 200, ok.text
    types = run(server.db.approval_workflows.find_one({"deliverable_id": d["id"]}))["required_types"]
    assert "MANAGER" in types and "LEADERSHIP" in types
    bad = api(env, "put", f"/deliverables/{d['id']}/approval-workflow", "admin-1", {"approval_types": ["BOGUS"]})
    assert bad.status_code == 400


def test_approving_a_deliverable_moves_it_to_the_next_stage(env):
    d = make(env)
    assert stage_of(d["id"])["current_stage"] == "Content"
    assert api(env, "post", f"/deliverables/{d['id']}/approve", "member-km", {"note": "ok"}).status_code in (400, 403)
    r = api(env, "post", f"/deliverables/{d['id']}/approve", "admin-1", {"note": "looks good"})
    assert r.status_code == 200, r.text
    after = stage_of(d["id"])
    assert after["current_stage"] == "Design"
    assert api(env, "post", "/deliverables/none/approve", "admin-1", {}).status_code == 404


def test_queue_count_and_board_answer_for_an_admin(env):
    make(env)
    assert api(env, "get", "/approvals", "admin-1").status_code == 200
    c = api(env, "get", "/approvals/pending-count", "admin-1")
    assert c.status_code == 200 and isinstance(c.json(), dict)
    assert api(env, "get", "/approvals/board", "admin-1").status_code == 200
    assert api(env, "get", "/bulk-review/count", "admin-1").status_code == 200
    assert api(env, "get", "/bulk-review", "admin-1").status_code == 200
    assert api(env, "get", "/approvals", "ghost-user").status_code == 401


def test_items_can_be_approved_hidden_and_unhidden_one_by_one(env):
    d = make(env)
    item = run(server.db.approval_items.find_one({"deliverable_id": d["id"]}))
    iid = item["id"]
    assert api(env, "post", f"/approval-items/{iid}/hide", "admin-1").status_code == 200
    assert run(server.db.approval_items.find_one({"id": iid})).get("hidden") is True
    assert api(env, "post", f"/approval-items/{iid}/unhide", "admin-1").status_code == 200
    assert run(server.db.approval_items.find_one({"id": iid})).get("hidden") is False
    assert api(env, "post", "/approval-items/bulk-hide", "admin-1", {"approval_item_ids": [iid]}).status_code == 200
    assert api(env, "post", "/approval-items/bulk-unhide", "admin-1", {"approval_item_ids": [iid]}).status_code == 200
    r = api(env, "post", f"/approval-items/{iid}/approve", "admin-1", {"note": "fine"})
    assert r.status_code == 200, r.text
    assert stage_of(d["id"])["current_stage"] == "Design"  # approving the only item moves the stage on
    assert api(env, "post", "/approval-items/nope/approve", "admin-1", {}).status_code == 404
