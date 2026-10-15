"""Projects team task sheet (/api/project-tasks), against the real app and an
in-memory MongoDB. Reuses the planning integration test's app setup:

    cd backend && pytest tests/test_project_tasks.py -n 0 -p no:cacheprovider
"""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import INVESCO_CLIENT, INVESCO_CONTRA, env, run, server  # noqa: E402,F401


def call(env, method, path, user_id, body=None):
    api = env.as_user(user_id)
    return getattr(api, method)("/api/project-tasks" + path, **({"json": body} if body is not None else {}))


def test_a_new_row_starts_blank_owned_by_its_creator_and_open_on_its_day(env):
    res = call(env, "post", "", "member-rb", {"day": "2026-10-15"})
    assert res.status_code == 200, res.text
    task = res.json()
    assert task["owner_id"] == "member-rb" and task["start_date"] == "2026-10-15"
    assert task["status"] == "On track" and task["done_date"] is None

    listing = call(env, "get", "", "member-km").json()
    assert [t["id"] for t in listing["tasks"]] == [task["id"]]
    assert "Client Call" in listing["options"]["task_types"]


def test_rows_live_in_their_own_collection_not_work_items(env):
    call(env, "post", "", "member-rb", {"task": "Cost proposal", "task_type": "Cost Proposal"})
    assert run(server.db.project_tasks.count_documents({})) == 1
    assert run(server.db.work_items.count_documents({})) == 0


def test_editing_cells_validates_and_logs_each_change(env):
    task = call(env, "post", "", "member-rb", {}).json()
    res = call(env, "patch", f"/{task['id']}", "member-rb", {
        "task": "Summit NFO deliverables",
        "task_type": "Internal Follow-up",
        "client_id": INVESCO_CLIENT,
        "project_id": INVESCO_CONTRA,
        "collaborator_ids": ["member-km", "member-rb"],
        "follow_up_teams": ["Design", "Content"],
        "internal_follow_up_date": "2026-10-16",
    })
    assert res.status_code == 200, res.text
    body = res.json()
    # owner is never also a collaborator; teams keep the fixed order
    assert body["collaborator_ids"] == ["member-km"]
    assert body["follow_up_teams"] == ["Content", "Design"]

    fields = {a["field"] for a in run(server.db.project_task_activity.find({"task_id": task["id"]}).to_list(50))}
    assert {"task", "client_id", "project_id", "internal_follow_up_date"} <= fields
    assert run(server.db.work_item_activity_log.count_documents({})) == 0

    assert call(env, "patch", f"/{task['id']}", "member-rb", {"task_type": "Party"}).status_code == 400
    assert call(env, "patch", f"/{task['id']}", "member-rb", {"internal_follow_up_date": "16-10-2026"}).status_code == 400
    assert call(env, "patch", f"/{task['id']}", "member-rb", {"project_id": "nope"}).status_code == 400


def test_a_project_from_another_client_is_refused_and_a_new_client_clears_it(env):
    task = call(env, "post", "", "member-rb", {"client_id": INVESCO_CLIENT, "project_id": INVESCO_CONTRA}).json()
    bad = call(env, "patch", f"/{task['id']}", "member-rb", {"client_id": "CLIENT - 006", "project_id": INVESCO_CONTRA})
    assert bad.status_code == 400
    moved = call(env, "patch", f"/{task['id']}", "member-rb", {"client_id": "CLIENT - 006"}).json()
    assert moved["client_id"] == "CLIENT - 006" and moved["project_id"] is None


def test_done_stamps_the_day_and_reopening_clears_it(env):
    task = call(env, "post", "", "member-rb", {"day": "2026-10-01"}).json()
    done = call(env, "patch", f"/{task['id']}", "member-rb", {"status": "Done", "day": "2026-10-09"}).json()
    assert done["done_date"] == "2026-10-09"
    reopened = call(env, "patch", f"/{task['id']}", "member-rb", {"status": "Delayed"}).json()
    assert reopened["done_date"] is None


def test_one_update_note_per_task_per_day(env):
    task = call(env, "post", "", "member-rb", {}).json()
    path = f"/{task['id']}/updates/2026-10-15"
    assert call(env, "put", path, "member-rb", {"note": "Sent script"}).status_code == 200
    call(env, "put", path, "member-km", {"note": "Sent revised script"})
    notes = call(env, "get", "", "member-rb").json()["updates"]
    assert [(n["day"], n["note"], n["user_id"]) for n in notes] == [("2026-10-15", "Sent revised script", "member-km")]
    call(env, "put", path, "member-rb", {"note": "  "})
    assert call(env, "get", "", "member-rb").json()["updates"] == []


def test_hr_cannot_edit_and_only_owner_or_manager_deletes(env):
    task = call(env, "post", "", "member-rb", {}).json()
    assert call(env, "post", "", "hr-1", {}).status_code == 403
    assert call(env, "delete", f"/{task['id']}", "member-km").status_code == 403
    assert call(env, "delete", f"/{task['id']}", "manager-hp").status_code == 200
    assert run(server.db.project_tasks.count_documents({})) == 0
