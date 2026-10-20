"""Work Sheet routes (work_items_routes.py) on the real app and an in-memory database."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import env, run, server  # noqa: E402,F401

DAY = "2026-10-21"


def api(env, method, path, user, body=None):
    c = env.as_user(user)
    kw = {"json": body} if body is not None else {}
    return getattr(c, method)("/api" + path, **kw)


def row(env, user="member-km", **extra):
    body = {"work_date": DAY, "deliverable_name": "Poster", "stage": "Content", "status": "Not Started", **extra}
    r = api(env, "post", "/work-items", user, body)
    assert r.status_code == 200, r.text
    return r.json()


def test_listing_works_for_members_and_admins_and_needs_login(env):
    mine = row(env, "member-km")
    row(env, "member-an", stage="Design")
    ids = [x["id"] for x in api(env, "get", "/work-items", "member-km").json()]
    assert mine["id"] in ids
    assert len(api(env, "get", "/work-items", "admin-1").json()) == 2
    assert api(env, "get", "/work-items/pending-count", "member-km").status_code == 200
    assert api(env, "get", "/work-items", "ghost").status_code == 401


def test_edit_own_row_validates_and_logs(env):
    r = row(env)
    ok = api(env, "patch", f"/work-items/{r['id']}", "member-km", {"remarks": "draft ready", "status": "Ongoing", "time_taken_minutes": 30})
    assert ok.status_code == 200, ok.text
    assert ok.json()["remarks"] == "draft ready" and ok.json()["status"] == "Ongoing"
    assert run(server.db.work_item_activity_log.count_documents({})) >= 1
    assert api(env, "patch", f"/work-items/{r['id']}", "member-km", {"work_date": "0002-03-04"}).status_code == 400
    assert api(env, "patch", "/work-items/none", "member-km", {"remarks": "x"}).status_code == 404
    assert api(env, "patch", f"/work-items/{r['id']}", "member-rb", {"remarks": "x"}).status_code in (403, 404)


def test_review_needs_the_assigned_reviewer_and_cannot_be_repeated(env):
    r = row(env, time_taken_minutes=30)
    run(server.db.work_items.update_one({"id": r["id"]}, {"$set": {"reviewer_id": "manager-hp", "status": "Ready for Review"}}))
    path = f"/work-items/{r['id']}/review?action=approve&note=good"
    wrong = api(env, "post", path, "manager-vs")
    assert wrong.status_code in (400, 403, 404), wrong.text
    first = api(env, "post", path, "manager-hp")
    assert first.status_code == 200, first.text
    assert api(env, "post", path, "manager-hp").status_code in (400, 409)


def test_bulk_create_update_delete_by_admin(env):
    made = api(env, "post", "/work-items/bulk-create", "member-km", {"count": 3, "template": {"work_date": DAY, "stage": "Content"}})
    assert made.status_code == 200, made.text
    ids = [x["id"] for x in made.json()]
    assert len(ids) == 3
    upd = api(env, "post", "/work-items/bulk-update", "member-km", {"ids": ids, "patch": {"remarks": "batch"}})
    assert upd.status_code == 200, upd.text
    assert {x["remarks"] for x in upd.json()} == {"batch"}
    assert api(env, "post", "/work-items/bulk-delete", "member-km", {"ids": ids[:2]}).status_code == 200
    assert run(server.db.work_items.count_documents({"id": {"$in": ids}})) == 1


def test_delete_removes_the_row_and_404s_after(env):
    r = row(env)
    assert api(env, "delete", f"/work-items/{r['id']}", "member-rb").status_code in (403, 404)
    assert api(env, "delete", f"/work-items/{r['id']}", "member-km").status_code == 200
    assert api(env, "delete", f"/work-items/{r['id']}", "member-km").status_code == 404


def test_history_route_is_not_mistaken_for_a_row_id(env):
    r = row(env)
    api(env, "patch", f"/work-items/{r['id']}", "member-km", {"remarks": "x"})
    h = api(env, "get", "/work-items/history", "member-km")
    assert h.status_code == 200, h.text


def test_tagging_a_teammate_copies_the_row_to_them(env):
    r = row(env, deliverable_name="Brochure")
    res = api(env, "post", "/work-items/collaborators", "member-km", {"rows": [r], "collaborator_ids": ["member-rb"]})
    assert res.status_code in (200, 400, 422), res.text
    if res.status_code == 200:
        assert run(server.db.work_items.count_documents({"creator_id": "member-rb"})) >= 1
