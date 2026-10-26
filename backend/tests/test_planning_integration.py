"""WhatsApp tasklist -> task cards -> Work Sheet / Planning, end to end.

Runs the REAL FastAPI app (auth, create_work_item and its Work Sheet rules, the
Work Sheet list endpoint) against an in-memory MongoDB. No network, no server,
no credentials, which makes it different from the other tests in this folder
(those call a deployed backend):

    cd backend && pytest tests/test_planning_integration.py -n 0 -p no:cacheprovider

(`-n 0` because pytest.ini otherwise starts two xdist workers.)

The tasklist_items used here are not hand-written: fixtures/tasklist_items.sample.json
is the exact output of the WhatsApp listener (parser + NLP matcher + mongoStore)
for a realistic tasklist, so a change to either side that breaks the hand-off
shows up here. Regenerate it with `node test/make-fixture.js <file>` in the
listener.

Needs: pip install mongomock-motor
"""
import asyncio
import copy
import json
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pmt_planning_test")
os.environ.setdefault("JWT_SECRET", "planning-test-secret")

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import jwt  # noqa: E402
import motor.motor_asyncio as _motor  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from mongomock_motor import AsyncMongoMockClient  # noqa: E402

# server.py opens its database at import time; point it at the in-memory one.
_real_client = _motor.AsyncIOMotorClient
_motor.AsyncIOMotorClient = AsyncMongoMockClient
try:
    import server  # noqa: E402
finally:
    _motor.AsyncIOMotorClient = _real_client

import planning  # noqa: E402

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "tasklist_items.sample.json").read_text())

IST = timezone(timedelta(hours=5, minutes=30))

# ids the listener's lexicon snapshot used for the fixture's lines
PHARMA_PROJECT = "79dac8f2-5c2b-44de-a246-40177d4ef9cf"
PHARMA_DELIVERABLE = "e50514ec-a1ee-4296-9536-ad2388b43c50"
CONTRA_PROJECT = "8b14c6c1-1cc0-4d67-b952-8270c21599bc"
INVESCO_CONTRA = "PROJECT - 756"
INVESCO_CLIENT = "CLIENT - 039"


def run(coro):
    return asyncio.run(coro)


def today_iso():
    return datetime.now(IST).date().isoformat()


def token_for(user_id):
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=1)},
        os.environ["JWT_SECRET"],
        algorithm="HS256",
    )


USERS = [
    {"id": "member-rb", "name": "Ratnesh Bor", "role": "member", "department": "Content"},
    {"id": "member-km", "name": "Krishna Saraswat", "role": "member", "department": "Content"},
    {"id": "manager-hp", "name": "Harshal Pawar", "role": "manager", "department": "Content"},
    {"id": "manager-vs", "name": "Vanshika Shah", "role": "manager", "department": "Content"},
    {"id": "manager-ab", "name": "Anjali Bhadra", "role": "manager", "department": "Design"},
    {"id": "member-an", "name": "Aniket Bangal", "role": "member", "department": "Design"},
    {"id": "admin-1", "name": "Gaurav Mody", "role": "admin", "department": "Administration"},
    {"id": "hr-1", "name": "Puneet", "role": "hr", "department": "Administration"},
    {"id": "member-test", "name": "Ratnesh Testing", "role": "member", "department": "Content"},
]


@pytest.fixture()
def env():
    """Fresh data for every test, and a client per user."""
    async def reset():
        for name in await server.db.list_collection_names():
            await server.db[name].delete_many({})

        await server.db.users.insert_many([dict(u, active=True, email=f"{u['id']}@x.test") for u in USERS])
        await server.db.clients.insert_many([
            {"id": "CLIENT - 006", "name": "ICICI Prudential Mutual Fund", "status": "Active"},
            {"id": INVESCO_CLIENT, "name": "Invesco", "status": "Active"},
        ])
        ts = "2026-01-01T00:00:00+00:00"
        await server.db.projects.insert_many([
            {"id": PHARMA_PROJECT, "name": "IPru Pharma ETF Campaign", "client_id": "CLIENT - 006", "code": "P1", "status": "Active", "hidden": False, "created_at": ts, "updated_at": ts},
            {"id": CONTRA_PROJECT, "name": "ICICI Prudential Contra Fund", "client_id": "CLIENT - 006", "code": "P2", "status": "Active", "hidden": False, "created_at": ts, "updated_at": ts},
            {"id": INVESCO_CONTRA, "name": "Invesco Concept Presentations (IEP) - Contra", "client_id": INVESCO_CLIENT, "code": "P3", "status": "Active", "hidden": False, "created_at": ts, "updated_at": ts},
        ])
        await server.db.deliverables.insert_many([
            {"id": PHARMA_DELIVERABLE, "project_id": PHARMA_PROJECT, "name": "From Lab To Life - Product Explainer", "type": "Newsletters", "created_at": ts, "updated_at": ts},
        ])
        await server.db.tasklist_items.insert_many(copy.deepcopy(FIXTURE["items"]))
        await server.db.nlp_match_logs.insert_many(copy.deepcopy(FIXTURE["logs"]))

    run(reset())
    server._user_cache.clear()

    api = TestClient(server.app)

    class Env:
        def as_user(self, user_id):
            api.cookies.clear()
            api.headers.pop("Authorization", None)
            api.headers["Authorization"] = f"Bearer {token_for(user_id)}"
            return api

        def get(self, path, user_id, **kw):
            return self.as_user(user_id).get("/api" + path, **kw)

        def post(self, path, user_id, body=None):
            return self.as_user(user_id).post("/api" + path, json=body or {})

        def item(self, seq):
            return run(server.db.tasklist_items.find_one({"seq": seq}, {"_id": 0}))

        def work_items(self, **query):
            return run(server.db.work_items.find(query, {"_id": 0}).to_list(100))

        def notifications(self, user_id):
            return run(server.db.notifications.find({"user_id": user_id}, {"_id": 0}).to_list(100))

        def set_item(self, seq, **fields):
            run(server.db.tasklist_items.update_one({"seq": seq}, {"$set": fields}))

    return Env()


# ----------------------------------------------------------- the fixture itself

def test_fixture_is_what_the_listener_promises():
    by_seq = {i["seq"]: i for i in FIXTURE["items"]}
    assert by_seq[1]["status"] == "pending" and by_seq[1]["assignee_user_id"] == "manager-hp"
    assert by_seq[2]["status"] == "pending" and by_seq[2]["assignee_user_id"] == "member-rb"
    assert by_seq[3]["status"] == "needs_review" and by_seq[3]["project_id"] == INVESCO_CONTRA
    assert by_seq[4]["status"] == "needs_review" and by_seq[4]["project_id"] is None


# --------------------------------------------------------------- access rules

def test_unauthenticated_is_rejected(env):
    assert TestClient(server.app).get("/api/planning/my-tasks").status_code == 401


def test_cards_are_for_people_who_log_work_only(env):
    assert env.get("/planning/my-tasks", "admin-1").status_code == 403
    assert env.get("/planning/my-tasks", "hr-1").status_code == 403


def test_planning_screens_are_for_managers_and_admins(env):
    assert env.get("/planning/overview", "member-rb").status_code == 403
    assert env.get("/planning/review", "member-rb").status_code == 403
    assert env.get("/planning/overview", "manager-vs").status_code == 200
    assert env.get("/planning/overview", "admin-1").status_code == 200


# ------------------------------------------------------------- the task cards

def test_a_member_sees_only_their_own_certain_tasks(env):
    cards = env.get("/planning/my-tasks", "member-rb").json()
    assert [c["task"] for c in cards] == ["investing blog"]
    card = cards[0]
    # exactly the fields TaskCardHost.jsx reads
    for key in ("id", "from", "role", "ago", "pri", "task", "proj", "client", "due", "dueIn", "dueTone", "est", "qty", "note", "load"):
        assert key in card, key
    assert card["from"] == "Vanshika Shah" and card["role"] == "Content manager"
    assert card["proj"] == "ICICI Prudential Contra Fund" and card["client"] == "ICICI Prudential Mutual Fund"
    assert card["pri"] == "P2" and card["est"] == 1.0


def test_high_priority_shows_as_p1_and_a_manager_assignee_gets_a_card_too(env):
    cards = env.get("/planning/my-tasks", "manager-hp").json()
    assert len(cards) == 1 and cards[0]["pri"] == "P1"
    assert cards[0]["task"] == "From Lab To Life - Product Explainer"   # the matched PMT deliverable, not the typed words


def test_lines_waiting_for_review_never_reach_anyone(env):
    for user in ("manager-vs", "member-rb", "manager-hp"):
        assert all(c["task"] not in ("Pitch narrative", "Totally unknown thing xyz")
                   for c in env.get("/planning/my-tasks", user).json())


# ------------------------------------------------- accept -> member's worksheet

def test_accepting_puts_the_task_in_that_members_work_sheet(env):
    card = env.get("/planning/my-tasks", "member-rb").json()[0]
    r = env.post(f"/planning/my-tasks/{card['id']}/accept", "member-rb")
    assert r.status_code == 200, r.text

    # the Work Sheet's own endpoint, as the member's browser calls it
    rows = env.get("/work-items?creator_id=member-rb", "member-rb").json()
    assert len(rows) == 1
    row = rows[0]
    assert row["creator_id"] == "member-rb"
    assert row["project_id"] == CONTRA_PROJECT and row["client_id"] == "CLIENT - 006"
    assert row["stage"] == "Content" and row["status"] == "Not Started"
    assert row["work_date"] == today_iso()
    assert row["deliverable_name"] == ""            # "Deliverable Name" is never filled; the dropdown says it
    assert "WhatsApp task from Vanshika Shah" in row["remarks"]
    # no such deliverable under the project: the Work Sheet's own "Not available"
    assert row["deliverable_not_available"] is True and row["deliverable_id"] is None

    item = env.item(2)
    assert item["status"] == "accepted" and item["work_item_id"] == row["id"]
    assert [h["action"] for h in item["history"]] == ["queued", "accepted"]
    # and the card is gone
    assert env.get("/planning/my-tasks", "member-rb").json() == []
    # nobody else's worksheet got it
    assert env.work_items(creator_id="manager-hp") == []


def test_a_matched_db_deliverable_is_linked_by_id(env):
    card = env.get("/planning/my-tasks", "manager-hp").json()[0]
    assert env.post(f"/planning/my-tasks/{card['id']}/accept", "manager-hp").status_code == 200
    (row,) = env.work_items(creator_id="manager-hp")
    assert row["deliverable_id"] == PHARMA_DELIVERABLE
    assert row["deliverable_not_available"] is False
    assert row["deliverable_type"] == "Newsletters"
    assert row["deliverable_name"] == ""


def test_a_task_with_no_deliverable_in_pmt_takes_the_type_the_listener_read(env):
    # "... > Carousel": no such deliverable exists, the listener read the type from the line
    env.set_item(2, deliverable_type="Carousel", type_source="line", type_candidates=[])
    card = env.get("/planning/my-tasks", "member-rb").json()[0]
    assert env.post(f"/planning/my-tasks/{card['id']}/accept", "member-rb").status_code == 200
    (row,) = env.work_items(creator_id="member-rb")
    assert row["deliverable_type"] == "Carousel"
    assert row["deliverable_id"] is None and row["deliverable_not_available"] is True
    assert row["deliverable_name"] == ""


def test_a_task_with_no_type_anywhere_stays_blank_as_before(env):
    card = env.get("/planning/my-tasks", "member-rb").json()[0]
    assert env.post(f"/planning/my-tasks/{card['id']}/accept", "member-rb").status_code == 200
    (row,) = env.work_items(creator_id="member-rb")
    assert not row["deliverable_type"]


def test_a_matched_deliverable_keeps_its_own_type_over_the_listeners_reading(env):
    env.set_item(1, deliverable_type="Carousel", type_source="line")
    card = env.get("/planning/my-tasks", "manager-hp").json()[0]
    assert env.post(f"/planning/my-tasks/{card['id']}/accept", "manager-hp").status_code == 200
    (row,) = env.work_items(creator_id="manager-hp")
    assert row["deliverable_id"] == PHARMA_DELIVERABLE
    assert row["deliverable_type"] == "Newsletters"


def test_accepting_twice_makes_one_row(env):
    card = env.get("/planning/my-tasks", "member-rb").json()[0]
    first = env.post(f"/planning/my-tasks/{card['id']}/accept", "member-rb").json()
    second = env.post(f"/planning/my-tasks/{card['id']}/accept", "member-rb").json()
    assert second["already_accepted"] is True and second["work_item_id"] == first["work_item_id"]
    assert len(env.work_items(creator_id="member-rb")) == 1


def test_a_live_claim_blocks_a_double_click_and_a_stale_one_recovers(env):
    task_id = env.item(2)["id"]
    env.set_item(2, status="accepting", accepting_at=datetime.now(timezone.utc).isoformat())
    assert env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").status_code == 409
    assert env.work_items(creator_id="member-rb") == []

    env.set_item(2, accepting_at=(datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat())
    assert env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").status_code == 200
    assert len(env.work_items(creator_id="member-rb")) == 1


def test_a_crashed_accept_does_not_create_a_second_row(env):
    """The row was made but the task never got marked accepted (process died)."""
    task_id = env.item(2)["id"]
    first = env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").json()["work_item_id"]
    env.set_item(2, status="accepting", work_item_id=None,
                 accepting_at=(datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat())
    again = env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").json()["work_item_id"]
    assert again == first and len(env.work_items(creator_id="member-rb")) == 1


def test_a_project_hidden_after_queuing_blocks_accept_and_keeps_the_task(env):
    run(server.db.projects.update_one({"id": CONTRA_PROJECT}, {"$set": {"hidden": True}}))
    task_id = env.item(2)["id"]
    r = env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb")
    assert r.status_code == 409 and "no longer available" in r.json()["detail"]
    assert env.item(2)["status"] == "pending"          # back in the queue, not lost
    assert env.work_items(creator_id="member-rb") == []


def test_nobody_can_accept_someone_elses_task(env):
    task_id = env.item(2)["id"]
    assert env.post(f"/planning/my-tasks/{task_id}/accept", "manager-hp").status_code == 404
    assert env.post(f"/planning/my-tasks/{task_id}/accept", "member-km").status_code == 404
    assert env.item(2)["status"] == "pending"


def test_work_sheet_rules_still_apply_on_accept(env):
    """A Design person cannot be handed a Content stage row: create_work_item decides."""
    run(server.db.users.update_one({"id": "member-rb"}, {"$set": {"department": "Administration"}}))
    server._user_cache.clear()
    r = env.post(f"/planning/my-tasks/{env.item(2)['id']}/accept", "member-rb")
    assert r.status_code == 403
    assert env.item(2)["status"] == "pending"


# ------------------------------------------------------------ decline and ask

def test_decline_records_the_reason_and_tells_the_assigner(env):
    task_id = env.item(2)["id"]
    r = env.post(f"/planning/my-tasks/{task_id}/decline", "member-rb",
                 {"reason": "Workload is full", "message": "Two reviews due today"})
    assert r.status_code == 200
    item = env.item(2)
    assert item["status"] == "declined" and item["decline_reason"] == "Workload is full"
    (note,) = env.notifications("manager-vs")
    assert note["type"] == "task_declined" and "Ratnesh Bor" in note["message"] and "Workload is full" in note["message"]
    assert env.get("/planning/my-tasks", "member-rb").json() == []
    assert env.work_items(creator_id="member-rb") == []


def test_decline_needs_a_reason(env):
    r = env.post(f"/planning/my-tasks/{env.item(2)['id']}/decline", "member-rb", {"reason": "  "})
    assert r.status_code == 400 and env.item(2)["status"] == "pending"


def test_when_the_sender_is_not_a_pmt_user_the_teams_managers_are_told(env):
    env.set_item(2, assigned_by_user_id=None)
    env.post(f"/planning/my-tasks/{env.item(2)['id']}/decline", "member-rb", {"reason": "Other"})
    assert len(env.notifications("manager-hp")) == 1 and len(env.notifications("manager-vs")) == 1
    assert env.notifications("manager-ab") == []        # the Design manager is not told


def test_a_question_keeps_the_task_in_the_queue(env):
    task_id = env.item(2)["id"]
    assert env.post(f"/planning/my-tasks/{task_id}/ask", "member-rb", {"message": "Hindi too?"}).status_code == 200
    item = env.item(2)
    assert item["status"] == "pending" and item["questions"][0]["text"] == "Hindi too?"
    assert [c["id"] for c in env.get("/planning/my-tasks", "member-rb").json()] == [task_id]
    assert env.notifications("manager-vs")[0]["type"] == "task_question"
    assert env.post(f"/planning/my-tasks/{task_id}/ask", "member-rb", {"message": " "}).status_code == 400


# --------------------------------------------------------------- Planning page

def test_overview_returns_what_the_planning_screen_draws(env):
    data = env.get("/planning/overview", "admin-1").json()
    assert set(data) == {"ctx", "tasks", "people"}
    assert len(data["ctx"]["days"]) == 5 and 0 <= data["ctx"]["today"] <= 4
    tasks = {t["task"]: t for t in data["tasks"]}
    assert set(tasks) == {"From Lab To Life - Product Explainer", "investing blog"}      # not the review-queue lines
    row = tasks["investing blog"]
    # exactly the fields planningLogic.taskFromRow maps
    assert set(row) == {"id", "who", "task", "proj", "d0", "d1", "est", "cat", "note", "sh", "status"}
    assert row["who"] == "Ratnesh Bor" and row["proj"] == "ICICI Prudential Contra Fund"
    assert row["status"] == "todo" and "not accepted yet" in row["note"]
    names = {p["name"] for p in data["people"]}
    assert "Ratnesh Bor" in names and "Aniket Bangal" in names
    assert "Ratnesh Testing" not in names and "Gaurav Mody" not in names     # test accounts and admins


def test_a_manager_sees_only_their_own_team(env):
    content = env.get("/planning/overview", "manager-vs").json()
    assert len(content["tasks"]) == 2 and {p["dept"] for p in content["people"]} == {"Content"}
    design = env.get("/planning/overview", "manager-ab").json()
    assert design["tasks"] == [] and {p["dept"] for p in design["people"]} == {"Design"}


def test_accepting_moves_the_planning_status_with_the_work_sheet_row(env):
    task_id = env.item(2)["id"]
    work_item_id = env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").json()["work_item_id"]

    def status():
        rows = env.get("/planning/overview", "manager-vs").json()["tasks"]
        row = next(t for t in rows if t["id"] == task_id)
        return row["status"], row["note"]

    assert status()[0] == "todo" and "not accepted" not in status()[1]
    run(server.db.work_items.update_one({"id": work_item_id}, {"$set": {"status": "Ongoing"}}))
    assert status()[0] == "wip"
    run(server.db.work_items.update_one({"id": work_item_id}, {"$set": {"status": "Closed"}}))
    assert status()[0] == "done"


# ----------------------------------------------------------------- reassigning

def test_reassign_moves_a_pending_task_within_the_team(env):
    task_id = env.item(2)["id"]
    r = env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "member-km"})
    assert r.status_code == 200, r.text
    assert env.get("/planning/my-tasks", "member-rb").json() == []
    assert [c["id"] for c in env.get("/planning/my-tasks", "member-km").json()] == [task_id]
    row = next(t for t in env.get("/planning/overview", "manager-vs").json()["tasks"] if t["id"] == task_id)
    assert row["who"] == "Krishna Saraswat" and row["note"].startswith("Reassigned from Ratnesh")


def test_reassign_refuses_other_teams_accepted_tasks_and_bad_targets(env):
    task_id = env.item(2)["id"]
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "member-an"}).status_code == 400  # Design
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "admin-1"}).status_code == 400
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "nobody"}).status_code == 400
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-ab", {"to_user_id": "member-km"}).status_code == 404  # other team's manager
    env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb")
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "member-km"}).status_code == 409


def test_a_declined_task_can_be_given_to_someone_else(env):
    task_id = env.item(2)["id"]
    env.post(f"/planning/my-tasks/{task_id}/decline", "member-rb", {"reason": "Not my skill area"})
    declined = env.get("/planning/review?status=declined", "manager-vs").json()
    assert [d["id"] for d in declined] == [task_id] and declined[0]["decline_reason"] == "Not my skill area"
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "member-km"}).status_code == 200
    item = env.item(2)
    assert item["status"] == "pending" and item["decline_reason"] is None
    assert len(env.get("/planning/my-tasks", "member-km").json()) == 1


# ------------------------------------------------------------- the review queue

def test_the_review_queue_lists_what_the_matcher_was_unsure_about(env):
    rows = env.get("/planning/review", "manager-vs").json()
    assert {r["raw_line"] for r in rows} == {
        "- Invesco Concept Presentations - Pitch narrative", "- Totally unknown thing xyz"}
    ambiguous = next(r for r in rows if "Pitch" in r["raw_line"])
    assert any("Ambiguous project" in why for why in ambiguous["review_reasons"])
    assert len(ambiguous["alternatives"]) >= 2          # the choices to pick between
    assert env.get("/planning/review", "manager-ab").json() == []
    assert env.get("/planning/review?status=bogus", "manager-vs").status_code == 400


def test_resolving_a_review_item_queues_it_for_the_assignee_and_logs_the_human_call(env):
    task_id = env.item(3)["id"]
    r = env.post(f"/planning/review/{task_id}/resolve", "manager-vs", {"project_id": INVESCO_CONTRA})
    assert r.status_code == 200 and r.json()["outcome"] == "confirmed_nlp"
    item = env.item(3)
    assert item["status"] == "pending" and item["needs_review"] is False
    assert item["project_id"] == INVESCO_CONTRA and item["client_id"] == INVESCO_CLIENT
    assert item["resolved_reasons"] and item["review_reasons"] == []
    # Vanshika (a manager) now has a card for it
    assert [c["task"] for c in env.get("/planning/my-tasks", "manager-vs").json()] == ["Pitch narrative"]
    log = run(server.db.nlp_match_logs.find_one({"seq": 3}, {"_id": 0}))
    assert log["human_resolution"]["outcome"] == "confirmed_nlp" and log["human_resolution"]["by"] == "manager-vs"
    assert log["scores"]["project"] is not None           # the NLP's own numbers are still there


def test_choosing_a_different_project_is_logged_as_a_correction(env):
    task_id = env.item(3)["id"]
    r = env.post(f"/planning/review/{task_id}/resolve", "manager-vs", {"project_id": CONTRA_PROJECT})
    assert r.json()["outcome"] == "corrected"
    assert env.item(3)["client_id"] == "CLIENT - 006"      # the client follows the project
    assert run(server.db.nlp_match_logs.find_one({"seq": 3}))["human_resolution"]["outcome"] == "corrected"


def test_resolve_refuses_bad_choices(env):
    task_id = env.item(4)["id"]
    run(server.db.projects.update_one({"id": CONTRA_PROJECT}, {"$set": {"hidden": True}}))
    assert env.post(f"/planning/review/{task_id}/resolve", "manager-vs", {"project_id": CONTRA_PROJECT, "assignee_user_id": "member-rb"}).status_code == 400
    assert env.post(f"/planning/review/{task_id}/resolve", "manager-vs", {"project_id": "nope", "assignee_user_id": "member-rb"}).status_code == 400
    # a deliverable of another project
    assert env.post(f"/planning/review/{task_id}/resolve", "manager-vs",
                    {"project_id": INVESCO_CONTRA, "deliverable_id": PHARMA_DELIVERABLE, "assignee_user_id": "member-rb"}).status_code == 400
    # an assignee from another team
    assert env.post(f"/planning/review/{task_id}/resolve", "manager-vs",
                    {"project_id": INVESCO_CONTRA, "assignee_user_id": "member-an"}).status_code == 400
    assert env.item(4)["status"] == "needs_review"          # nothing half-done
    # a task that is not in review cannot be "resolved"
    assert env.post(f"/planning/review/{env.item(2)['id']}/resolve", "manager-vs", {"project_id": INVESCO_CONTRA}).status_code == 409


def test_reject_discards_a_review_item_and_logs_it(env):
    task_id = env.item(4)["id"]
    assert env.post(f"/planning/review/{task_id}/reject", "manager-vs", {"reason": "not a task"}).status_code == 200
    assert env.item(4)["status"] == "rejected"
    assert run(server.db.nlp_match_logs.find_one({"seq": 4}))["human_resolution"]["outcome"] == "rejected"
    assert env.post(f"/planning/review/{task_id}/reject", "manager-vs").status_code == 409
    assert env.post(f"/planning/review/{env.item(2)['id']}/reject", "manager-vs").status_code == 409  # pending ones are not rejectable here


# ------------------------------------------- the planning maths feeding the UI

NOW = datetime(2026, 10, 9, 8, 0, tzinfo=timezone.utc)     # Fri 9 Oct 2026, 13:30 IST


def item(**over):
    base = {"id": str(uuid.uuid4()), "status": "pending", "work_date": "2026-10-09",
            "created_at": "2026-10-09T03:00:00+00:00", "seq": 1, "assignee_pmt_name": "Ratnesh Bor",
            "deliverable_name": "Blog", "project_name": "Contra", "est_minutes": None}
    base.update(over)
    return base


def test_week_context_is_the_real_week():
    ctx = planning.week_context(NOW)["ctx"]
    assert ctx["days"] == ["Mon 5", "Tue 6", "Wed 7", "Thu 8", "Fri 9"]
    assert ctx["today"] == 4 and ctx["date"] == "2026-10-09" and ctx["now"] == 13.5
    assert ctx["week_label"] == "Mon 5 – Fri 9 Oct" and ctx["today_label"] == "Friday, 9 Oct"


def test_plan_rows_new_planned_rolled_and_done():
    rows = {r["task"]: r for r in planning.build_plan_rows([
        item(deliverable_name="New one"),
        item(deliverable_name="Planned", created_at="2026-10-06T05:00:00+00:00"),
        item(deliverable_name="Late", work_date="2026-10-07", status="accepted", work_item_id="w1"),
        item(deliverable_name="Finished", work_date="2026-10-07", status="accepted", work_item_id="w2"),
    ], {"w1": "Ongoing", "w2": "Closed"}, NOW)}
    assert (rows["New one"]["cat"], rows["New one"]["d0"], rows["New one"]["d1"]) == ("new", 4, 4)
    # a WhatsApp task is "assigned" whenever it was posted; only Work Sheet rows are "extra"
    assert rows["Planned"]["cat"] == "new" and rows["Planned"]["note"] == "Assigned Tue 6 · not accepted yet"
    assert (rows["Late"]["cat"], rows["Late"]["d0"], rows["Late"]["d1"], rows["Late"]["status"]) == ("rolled", 2, 4, "wip")
    assert rows["Late"]["note"] == "From Wed 7 · 2d late"
    assert rows["Finished"]["cat"] == "new" and rows["Finished"]["status"] == "done"   # done work is not "late"


def test_todays_bars_are_stacked_from_the_start_of_the_day():
    rows = planning.build_plan_rows([
        item(seq=1, est_minutes=90), item(seq=2, est_minutes=60), item(seq=3, assignee_pmt_name="Other"),
    ], {}, NOW)
    assert [r["sh"] for r in rows] == [9.5, 11.0, 9.5]
    assert rows[0]["est"] == 1.5


def test_the_default_estimate_applies_until_a_person_sets_one():
    assert planning.est_hours({"est_minutes": None}) == 1.0
    assert planning.est_hours({"est_minutes": 150}) == 2.5


def test_due_and_ago_wording():
    assert planning.due_view("2026-10-09T18:00:00+05:30", NOW) == {"due": "Today · 6:00 PM", "dueIn": "in 5h", "dueTone": "soon"}
    assert planning.due_view("2026-10-09T14:00:00+05:30", NOW)["dueTone"] == "urgent"
    assert planning.due_view("2026-10-12T13:00:00+05:30", NOW) == {"due": "Mon 12 Oct · 1:00 PM", "dueIn": "in 2 days", "dueTone": "ok"}
    assert planning.due_view("2026-10-08T18:00:00+05:30", NOW)["dueIn"] == "overdue"
    assert planning.ago_text("2026-10-09T07:55:00+00:00", NOW) == "5 min ago"
    assert planning.ago_text("2026-10-09T05:00:00+00:00", NOW) == "3h ago"


# ------------------------------------------- Work Sheet rows typed in by hand

def sheet_row(owner="member-rb", **over):
    """A row somebody filled in on the Work Sheet themselves (no WhatsApp task)."""
    row = {
        "id": str(uuid.uuid4()), "creator_id": owner, "work_date": today_iso(), "month": today_iso()[:7],
        "deliverable_name": "Weekly newsletter", "deliverable_type": "Newsletters",
        "project_id": CONTRA_PROJECT, "status": "Not Started", "time_taken_minutes": 90,
        "stage": "Content", "work_category": "Core",
        "created_at": datetime.now(timezone.utc).isoformat(), "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    row.update(over)
    return row


def add_sheet_rows(*rows):
    run(server.db.work_items.insert_many([dict(r) for r in rows]))


def plan_for(env, user="admin-1"):
    return {t["id"]: t for t in env.get("/planning/overview", user).json()["tasks"]}


def test_a_row_typed_into_the_work_sheet_appears_on_the_planning_page(env):
    row = sheet_row()
    add_sheet_rows(row)
    task = plan_for(env)[row["id"]]
    assert task["who"] == "Ratnesh Bor" and task["task"] == "Newsletters"       # no dropdown deliverable: its type, not the typed name
    assert task["proj"] == "ICICI Prudential Contra Fund"
    assert task["est"] == 1.5                       # the time logged on the row
    assert task["status"] == "todo" and task["cat"] == "planned" and task["note"] == "Logged today"
    assert task["src"] == "worksheet"
    # WhatsApp rows are unchanged (no src key)
    assert all("src" not in t for t in env.get("/planning/overview", "admin-1").json()["tasks"] if t["id"] != row["id"])


def test_the_work_sheet_status_drives_the_planning_status(env):
    started, finished = sheet_row(status="Ongoing"), sheet_row(status="Closed")
    add_sheet_rows(started, finished)
    plan = plan_for(env)
    assert plan[started["id"]]["status"] == "wip" and plan[finished["id"]]["status"] == "done"


def test_a_past_typed_row_stays_on_its_own_day_and_is_not_rolled_forward(env):
    # A Work Sheet row records work done on its date. Carrying it into today
    # counted the same hours again on every later day.
    yesterday = (datetime.now(IST).date() - timedelta(days=1)).isoformat()
    row = sheet_row(work_date=yesterday)
    add_sheet_rows(row)
    task = plan_for(env).get(row["id"])
    if task is not None:
        assert task["cat"] == "planned" and task["d0"] == task["d1"]


def test_weekends_and_listed_holidays_have_no_plan_day():
    assert planning.holiday_name(date(2026, 10, 11)) == "Sunday"
    assert planning.holiday_name(date(2026, 10, 12)) == ""
    assert planning.week_context(NOW)["ctx"]["holiday"] == ""


def test_rows_that_say_nothing_or_are_thrown_away_are_left_out(env):
    blank = sheet_row(deliverable_name="", deliverable_type="", project_id=None)
    scrapped = sheet_row(status="Scrap")
    nobody = sheet_row(owner=None)
    add_sheet_rows(blank, scrapped, nobody)
    plan = plan_for(env)
    assert not ({blank["id"], scrapped["id"], nobody["id"]} & set(plan))


def test_a_row_made_from_a_whatsapp_task_is_not_counted_twice(env):
    task_id = env.item(2)["id"]
    work_item_id = env.post(f"/planning/my-tasks/{task_id}/accept", "member-rb").json()["work_item_id"]
    plan = plan_for(env)
    assert task_id in plan and work_item_id not in plan
    assert "src" not in plan[task_id]


def test_a_manager_sees_manual_rows_of_their_own_team_only(env):
    mine, other_team = sheet_row("member-rb"), sheet_row("member-an", stage="Design")
    add_sheet_rows(mine, other_team)
    assert mine["id"] in plan_for(env, "manager-vs") and other_team["id"] not in plan_for(env, "manager-vs")
    assert other_team["id"] in plan_for(env, "manager-ab") and mine["id"] not in plan_for(env, "manager-ab")
    assert {mine["id"], other_team["id"]} <= set(plan_for(env, "admin-1"))


def test_test_accounts_do_not_show_up(env):
    row = sheet_row("member-test")
    add_sheet_rows(row)
    assert row["id"] not in plan_for(env)


def test_manual_and_whatsapp_bars_stack_one_after_another_today(env):
    first, second = sheet_row(time_taken_minutes=60), sheet_row(time_taken_minutes=120)
    add_sheet_rows(first, second)
    data = env.get("/planning/overview", "admin-1").json()
    today = data["ctx"]["today"]
    mine = sorted(
        (t for t in data["tasks"] if t["who"] == "Ratnesh Bor" and t["d0"] <= today <= t["d1"]),
        key=lambda t: t["sh"],
    )
    assert len(mine) >= 2
    starts = [t["sh"] for t in mine]
    assert len(starts) == len(set(starts))      # no two bars start at the same time


def test_todays_manual_work_counts_towards_the_load_on_a_task_card(env):
    before = env.get("/planning/my-tasks", "member-rb").json()[0]["load"]
    add_sheet_rows(sheet_row(time_taken_minutes=90), sheet_row(time_taken_minutes=60, status="Closed"))
    after = env.get("/planning/my-tasks", "member-rb").json()[0]["load"]
    assert after == round(before + 1.5, 2)      # the closed row is done, so it is not load


def test_sheet_rows_become_plan_items_the_planner_can_draw():
    rows = [sheet_row(), sheet_row(deliverable_name=" ", deliverable_type="", project_id=None)]
    items, statuses = planning.sheet_rows_as_items(rows, {"member-rb": "Ratnesh Bor"}, {CONTRA_PROJECT: "Contra"})
    assert len(items) == 1
    assert items[0]["assignee_pmt_name"] == "Ratnesh Bor" and items[0]["project_name"] == "Contra"
    assert statuses[rows[0]["id"]] == "Not Started"


def test_work_waiting_on_a_reviewer_is_stuck_in_review_not_late():
    rows = {r["task"]: r for r in planning.build_plan_rows([
        item(deliverable_name="In review today", status="accepted", work_item_id="r1"),
        item(deliverable_name="In review since Wed", work_date="2026-10-07", status="accepted", work_item_id="r2"),
        item(deliverable_name="Sent back", work_date="2026-10-07", status="accepted", work_item_id="c1"),
        item(deliverable_name="Reworking", status="accepted", work_item_id="c2"),
        item(deliverable_name="Still theirs and late", work_date="2026-10-07", status="accepted", work_item_id="w1"),
    ], {"r1": "Ready for Review", "r2": "Ready for Review", "c1": "Changes Requested",
        "c2": "Rework", "w1": "Ongoing"}, NOW)}
    assert rows["In review today"]["cat"] == "review" and rows["In review today"]["note"] == "Waiting for review"
    stuck = rows["In review since Wed"]
    assert stuck["cat"] == "review" and stuck["note"] == "Waiting for review · since Wed 7"
    assert (stuck["d0"], stuck["d1"]) == (2, 4)           # the bar still runs up to today
    assert rows["Sent back"]["cat"] == "changes" and rows["Sent back"]["note"] == "Changes requested · since Wed 7"
    assert rows["Reworking"]["cat"] == "changes"
    assert rows["Still theirs and late"]["cat"] == "rolled"


def test_a_typed_row_waiting_for_review_is_stuck_in_review(env):
    row = sheet_row(status="Ready for Review")
    add_sheet_rows(row)
    assert plan_for(env)[row["id"]]["cat"] == "review"


# ------------------------------------------------------------ the Animation team

def _add_animation_people_and_items():
    run(server.db.users.insert_many([
        {"id": "member-anim", "name": "Anim Member", "role": "member", "department": "Animation", "active": True, "email": "anim-member@x.test"},
        {"id": "manager-anim", "name": "Anim Manager", "role": "manager", "department": "Animation", "active": True, "email": "anim-manager@x.test"},
    ]))
    server._user_cache.clear()
    base = copy.deepcopy(FIXTURE["items"][0])
    ready = dict(
        base, id="anim-ready", seq=90, team="animation", dedupe_key="anim-1", status="pending",
        assignee_user_id="member-anim", assignee_name="Anim Member", assignee_pmt_name="Anim Member",
    )
    held = dict(
        base, id="anim-held", seq=91, team="animation", dedupe_key="anim-2", status="needs_review",
        needs_review=True, review_reasons=["Ambiguous project"], assignee_user_id=None,
    )
    run(server.db.tasklist_items.insert_many([ready, held]))


def test_every_planning_department_can_receive_tasklists():
    """A department the listener can write tasks for but PMT cannot map to is a
    silent black hole: the task is stored and nobody ever sees it."""
    assert set(planning.TEAM_DEPARTMENT.values()) == set(planning.PLAN_DEPARTMENTS)


def test_animation_tasks_reach_the_animation_team_and_nobody_else(env):
    _add_animation_people_and_items()

    cards = env.get("/planning/my-tasks", "member-anim").json()
    assert [c["id"] for c in cards] == ["anim-ready"]

    # a Content member never sees an Animation card
    assert "anim-ready" not in [c["id"] for c in env.get("/planning/my-tasks", "member-rb").json()]

    review = env.get("/planning/review", "manager-anim")
    assert review.status_code == 200
    assert "anim-held" in [r["id"] for r in review.json()]
    # other teams' managers do not get it in their review queue
    assert "anim-held" not in [r["id"] for r in env.get("/planning/review", "manager-vs").json()]


def test_a_task_with_a_named_client_but_no_project_can_be_accepted(env):
    """The listener queues it as 'project to be confirmed'; accepting must make a
    Work Sheet row without a project instead of failing with a 409."""
    base = copy.deepcopy(FIXTURE["items"][0])
    run(server.db.tasklist_items.insert_one(dict(
        base, id="noproj", seq=95, dedupe_key="noproj-1", status="pending",
        assignee_user_id="member-rb", assignee_name="Ratnesh", assignee_pmt_name="Ratnesh Bor",
        project_id=None, project_name=None, project_text=None, deliverable_id=None,
        deliverable_name="PPT first for design approval", project_unconfirmed=True,
    )))
    cards = env.get("/planning/my-tasks", "member-rb").json()
    card = next(c for c in cards if c["id"] == "noproj")
    assert card["proj"] == "Project to be confirmed"
    r = env.post("/planning/my-tasks/noproj/accept", "member-rb")
    assert r.status_code == 200, r.text
    row = next(x for x in env.work_items(creator_id="member-rb") if x.get("source_task_id") == "noproj")
    assert row["deliverable_name"] == ""
    assert row["project_id"] in (None, "")
    assert row["client_id"] == base["client_id"]


# ------------------------------------------- auto-accept after 1 hour unanswered

def age_task(env, seq, minutes, work_date=None):
    """Make task `seq` look like it was posted `minutes` ago (today by default)."""
    env.set_item(
        seq,
        work_date=work_date or today_iso(),
        created_at=(datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat(),
    )


def test_an_unanswered_card_is_accepted_after_an_hour(env):
    age_task(env, 2, 61)
    assert run(server._auto_accept_due()) == 1

    item = env.item(2)
    assert item["status"] == "accepted" and item["auto_accepted"] is True
    assert item["history"][-1]["action"] == "auto_accepted" and item["history"][-1]["by"] == "system"
    (row,) = env.work_items(creator_id="member-rb")
    assert item["work_item_id"] == row["id"] and row["source_task_id"] == item["id"]
    assert row["stage"] == "Content" and row["work_date"] == today_iso()
    # the sticky note is gone, and nobody else was touched (task 1 is from another day)
    assert env.get("/planning/my-tasks", "member-rb").json() == []
    assert env.item(1)["status"] == "pending"


def test_a_card_younger_than_an_hour_is_left_for_the_person(env):
    age_task(env, 2, 30)
    assert run(server._auto_accept_due()) == 0
    assert env.item(2)["status"] == "pending" and env.work_items(creator_id="member-rb") == []


def test_a_task_from_an_earlier_day_is_never_auto_accepted(env):
    yesterday = (datetime.now(IST).date() - timedelta(days=1)).isoformat()
    age_task(env, 2, 600, work_date=yesterday)
    assert run(server._auto_accept_due()) == 0
    assert env.item(2)["status"] == "pending" and env.work_items(creator_id="member-rb") == []


def test_auto_accept_twice_or_after_a_click_makes_one_row(env):
    age_task(env, 2, 90)
    assert run(server._auto_accept_due()) == 1
    assert run(server._auto_accept_due()) == 0
    assert len(env.work_items(creator_id="member-rb")) == 1

    age_task(env, 1, 90)
    card = env.get("/planning/my-tasks", "manager-hp").json()[0]
    assert env.post(f"/planning/my-tasks/{card['id']}/accept", "manager-hp").status_code == 200
    assert run(server._auto_accept_due()) == 0
    assert len(env.work_items(creator_id="manager-hp")) == 1
    assert env.item(1).get("auto_accepted") is None


def test_a_declined_card_is_not_auto_accepted(env):
    age_task(env, 2, 90)
    task_id = env.item(2)["id"]
    assert env.post(f"/planning/my-tasks/{task_id}/decline", "member-rb", {"reason": "Too busy"}).status_code == 200
    assert run(server._auto_accept_due()) == 0
    assert env.item(2)["status"] == "declined"


def test_auto_accept_that_is_refused_keeps_the_card_and_waits_before_retrying(env):
    run(server.db.projects.update_one({"id": CONTRA_PROJECT}, {"$set": {"hidden": True}}))
    age_task(env, 2, 90)
    assert run(server._auto_accept_due()) == 0

    item = env.item(2)
    assert item["status"] == "pending" and "no longer available" in item["auto_accept_error"]
    assert env.work_items(creator_id="member-rb") == []
    first_failure = item["auto_accept_failed_at"]

    assert run(server._auto_accept_due()) == 0           # inside the retry wait: not tried again
    assert env.item(2)["auto_accept_failed_at"] == first_failure

    run(server.db.projects.update_one({"id": CONTRA_PROJECT}, {"$set": {"hidden": False}}))
    env.set_item(2, auto_accept_failed_at=(datetime.now(timezone.utc) - timedelta(minutes=20)).isoformat())
    assert run(server._auto_accept_due()) == 1           # retried once the wait is over
    assert env.item(2)["status"] == "accepted"


def test_reassigning_gives_the_new_person_a_full_hour(env):
    age_task(env, 2, 90)
    task_id = env.item(2)["id"]
    assert env.post(f"/planning/tasks/{task_id}/reassign", "manager-vs", {"to_user_id": "member-km"}).status_code == 200
    assert run(server._auto_accept_due()) == 0
    assert env.item(2)["status"] == "pending" and env.item(2)["assignee_user_id"] == "member-km"

    env.set_item(2, released_at=(datetime.now(timezone.utc) - timedelta(minutes=61)).isoformat())
    assert run(server._auto_accept_due()) == 1
    assert len(env.work_items(creator_id="member-km")) == 1 and env.work_items(creator_id="member-rb") == []


def test_auto_accept_can_be_turned_off(env, monkeypatch):
    monkeypatch.setattr(planning, "AUTO_ACCEPT_AFTER_MINUTES", 0)
    age_task(env, 2, 600)
    assert run(server._auto_accept_due()) == 0
    assert env.item(2)["status"] == "pending"


# ------------------------------------ approval notices are for managers only

STAGE_HANDOFF = {"id": "d-handoff", "name": "Multi Asset PPT", "project_id": PHARMA_PROJECT, "stage_schedule": {}}


def test_a_stage_handoff_notifies_the_departments_managers_only(env):
    run(server._notify_stage_handoff(STAGE_HANDOFF, "Content", "2026-10-14T00:00:00+00:00"))
    for manager in ("manager-hp", "manager-vs"):
        (n,) = env.notifications(manager)
        assert n["type"] == "stage_handoff" and n["title"] == "Content approval ready"
        assert n["action_type"] == "open_approvals"
    # members of that team, the other team's manager and admins get nothing
    for other in ("member-rb", "member-km", "member-test", "manager-ab", "admin-1"):
        assert env.notifications(other) == [], other


def test_a_new_deliverable_notice_goes_to_managers_only(env):
    project = {"id": PHARMA_PROJECT, "name": "IPru Pharma ETF Campaign", "client_id": "CLIENT - 006"}
    deliverable = {"id": "d-new", "name": "Teaser", "required_stages": ["Content", "Design"], "stage_schedule": {}}
    run(server._notify_new_project(project, [deliverable], title="New deliverable added"))
    for manager in ("manager-hp", "manager-vs", "manager-ab"):
        (n,) = env.notifications(manager)
        assert n["type"] == "new_project" and n["title"] == "New deliverable added"
    for other in ("member-rb", "member-km", "member-an", "admin-1"):
        assert env.notifications(other) == [], other


def _stored_notice(user_id, key, **fields):
    return {
        "id": f"n-{key}", "user_id": user_id, "title": "t", "message": "m",
        "project_id": None, "deliverable_id": "d-old", "client_id": None, "stage": "Design",
        "created_at": "2026-10-14T00:00:00+00:00", "read_at": None, "actioned_at": None,
        "dedupe_key": key, **fields,
    }


def test_approval_notices_already_stored_for_members_are_hidden_and_then_removed(env):
    run(server.db.notifications.insert_many([
        _stored_notice("member-an", "a1", type="stage_handoff", action_type="open_worksheet"),
        _stored_notice("member-an", "a2", type="new_project", action_type="add_work_row"),
        _stored_notice("member-an", "a3", type="task_declined", action_type=None),
        _stored_notice("manager-ab", "b1", type="stage_handoff", action_type="open_approvals"),
        _stored_notice("admin-1", "c1", type="new_project", action_type=None, deliverable_id=None),
    ]))

    # hidden at once, before the cleanup has run
    member_view = env.get("/notifications", "member-an").json()
    assert [n["type"] for n in member_view] == ["task_declined"]
    assert [n["type"] for n in env.get("/notifications", "manager-ab").json()] == ["stage_handoff"]
    assert [n["type"] for n in env.get("/notifications", "admin-1").json()] == ["new_project"]

    run(server.migrate_manager_only_approval_notifications())
    kept = {n["dedupe_key"] for n in run(server.db.notifications.find({}, {"_id": 0}).to_list(50))}
    assert kept == {"a3", "b1", "c1"}

    run(server.migrate_manager_only_approval_notifications())   # safe to run again
    assert len(run(server.db.notifications.find({}).to_list(50))) == 3


# ------------------------------- Bulk Review rows a manager never closes: 24 h

def _review_row(row_id, reviewer_id, hours_ago, status="Ready for Review"):
    stamp = (datetime.now(timezone.utc) - timedelta(hours=hours_ago)).isoformat()
    return {
        "id": row_id, "creator_id": "member-rb", "reviewer_id": reviewer_id, "status": status,
        "work_date": today_iso(), "stage": "Content", "created_at": stamp, "updated_at": stamp,
    }


def test_a_manager_review_waiting_over_24_hours_is_closed(env):
    run(server.db.work_items.insert_many([
        _review_row("old-mgr", "manager-hp", 25),
        _review_row("fresh-mgr", "manager-hp", 23),
        _review_row("old-other-mgr", "manager-vs", 100),
    ]))
    assert run(server.auto_close_stale_reviews()) == 2

    status = {r["id"]: r["status"] for r in run(server.db.work_items.find({}, {"_id": 0}).to_list(10))}
    assert status == {"old-mgr": "Closed", "fresh-mgr": "Ready for Review", "old-other-mgr": "Closed"}

    # the same trail the Approve button leaves, by "system" and marked automatic
    (log,) = run(server.db.work_item_activity_log.find({"work_item_id": "old-mgr"}, {"_id": 0}).to_list(5))
    assert log["action"] == "WORK_ITEM_APPROVED" and log["changed_by"] == "system"
    assert log["old_value"] == "Ready for Review" and log["new_value"] == "Closed"
    assert log["metadata"]["auto_closed"] is True
    # and it has left that manager's Bulk Review queue
    assert env.get("/bulk-review/count", "manager-hp").json() == {"count": 1}


def test_only_manager_reviews_are_auto_closed_and_other_statuses_are_left_alone(env):
    run(server.db.work_items.insert_many([
        _review_row("admin-review", "admin-1", 400),
        _review_row("no-reviewer", None, 400),
        _review_row("changes", "manager-hp", 400, status="Changes Requested"),
        _review_row("ongoing", "manager-hp", 400, status="Ongoing"),
    ]))
    assert run(server.auto_close_stale_reviews()) == 0
    status = {r["id"]: r["status"] for r in run(server.db.work_items.find({}, {"_id": 0}).to_list(10))}
    assert status == {
        "admin-review": "Ready for Review", "no-reviewer": "Ready for Review",
        "changes": "Changes Requested", "ongoing": "Ongoing",
    }


def test_auto_close_runs_once_per_row_and_can_be_turned_off(env, monkeypatch):
    run(server.db.work_items.insert_one(_review_row("old-mgr", "manager-hp", 30)))

    monkeypatch.setattr(server, "REVIEW_AUTO_CLOSE_HOURS", 0)
    assert run(server.auto_close_stale_reviews()) == 0
    assert run(server.db.work_items.find_one({"id": "old-mgr"}))["status"] == "Ready for Review"

    monkeypatch.setattr(server, "REVIEW_AUTO_CLOSE_HOURS", 24)
    assert run(server.auto_close_stale_reviews()) == 1
    assert run(server.auto_close_stale_reviews()) == 0
    assert len(run(server.db.work_item_activity_log.find({"work_item_id": "old-mgr"}).to_list(5))) == 1


def test_a_row_with_an_unreadable_date_is_skipped_not_closed(env):
    row = _review_row("odd-date", "manager-hp", 400)
    row["updated_at"] = "last tuesday"
    row["created_at"] = None
    run(server.db.work_items.insert_one(row))
    assert run(server.auto_close_stale_reviews()) == 0
    assert run(server.db.work_items.find_one({"id": "odd-date"}))["status"] == "Ready for Review"


def test_open_rows_untouched_for_2_hours_are_closed_but_on_hold_is_kept(env):
    run(server.db.work_items.insert_many([
        _review_row("old-ongoing", None, 3, status="Ongoing"),
        _review_row("old-not-started", None, 3, status="Not Started"),
        _review_row("old-rework", "admin-1", 3, status="Rework"),
        _review_row("fresh-ongoing", None, 1, status="Ongoing"),
        _review_row("old-on-hold", None, 30 * 24, status="On Hold"),
        _review_row("old-scrap", None, 30 * 24, status="Scrap"),
    ]))
    assert run(server.auto_close_stale_rows()) == 3

    status = {r["id"]: r["status"] for r in run(server.db.work_items.find({}, {"_id": 0}).to_list(10))}
    assert status == {
        "old-ongoing": "Closed", "old-not-started": "Closed", "old-rework": "Closed",
        "fresh-ongoing": "Ongoing", "old-on-hold": "On Hold", "old-scrap": "Scrap",
    }

    (log,) = run(server.db.work_item_activity_log.find({"work_item_id": "old-ongoing"}, {"_id": 0}).to_list(5))
    assert log["action"] == "WORK_ITEM_STATUS_CHANGED" and log["changed_by"] == "system"
    assert log["old_value"] == "Ongoing" and log["new_value"] == "Closed"
    assert log["metadata"]["auto_closed"] is True

    # once per row
    assert run(server.auto_close_stale_rows()) == 0


def test_stale_row_close_can_be_turned_off(env, monkeypatch):
    run(server.db.work_items.insert_one(_review_row("old", None, 24 * 10, status="Ongoing")))
    monkeypatch.setattr(server, "STALE_ROW_AUTO_CLOSE_HOURS", 0)
    assert run(server.auto_close_stale_rows()) == 0
    assert run(server.db.work_items.find_one({"id": "old"}))["status"] == "Ongoing"


# ------------------------------------------------- read cache on polled counts

def test_pending_count_is_cached_but_any_write_request_refreshes_it(env):
    """The sidebar badge is polled by every open tab: repeated reads share one
    answer, yet a person's own write request must show up on the very next read."""
    server.read_cache.clear()
    user = run(server.db.users.find_one({"id": "member-rb"}, {"_id": 0}))
    stage = server.DEPARTMENT_TO_STAGE.get(user["department"])

    def count():
        return env.get("/work-items/pending-count", "member-rb").json()["count"]

    before = count()
    # A row written behind the app's back (like a background job or the listener)
    run(server.db.work_items.insert_one({
        "id": "cache-probe-1", "status": "Not Started", "stage": stage, "creator_id": "member-rb",
    }))
    assert count() == before          # still the cached answer
    env.post("/auth/logout", "member-rb")   # any non-GET request drops the cache
    assert count() == before + 1
