"""Campaign Ideation Plan rows cover several projects at once.

One Content row of a "Campaign Ideation Plan (...)" type lists every project the
ideation covers (project_ids). Its quantity is the number of projects, and
quantity_items[i] is the time for project_ids[i]. Runs against a live backend
like the other work-sheet tests."""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://task-sheet-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"X-User-Id": "admin-1"}
MEMBER = {"X-User-Id": "member-1"}

PEER = "Campaign Ideation Plan (Content Peer Analysis)"
KEYWORDS = "Campaign Ideation Plan (Includes Keywords)"


def _project(name, client_id):
    r = requests.post(f"{API}/projects", headers=ADMIN, json={
        "name": name, "client_id": client_id,
        "start_date": "2026-01-01", "end_date": "2026-02-01",
    })
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="module")
def ctx():
    client = requests.post(f"{API}/clients", headers=ADMIN, json={"name": "TEST_Client_Ideation"}).json()
    other = requests.post(f"{API}/clients", headers=ADMIN, json={"name": "TEST_Client_Ideation_B"}).json()
    projects = [_project(f"TEST_Ideation_P{i}", client["id"]) for i in (1, 2, 3)]
    outsider = _project("TEST_Ideation_Other", other["id"])
    made = []
    yield {"client": client["id"], "projects": projects, "outsider": outsider, "made": made}
    for item_id in made:
        requests.delete(f"{API}/work-items/{item_id}", headers=ADMIN)
    for pid in [*projects, outsider]:
        requests.delete(f"{API}/projects/{pid}", headers=ADMIN)


def _new_row(ctx, **extra):
    r = requests.post(f"{API}/work-items", headers=MEMBER, json={
        "deliverable_name": "TEST_ideation",
        "deliverable_type": PEER,
        "stage": "Content",
        "project_id": ctx["projects"][0],
        **extra,
    })
    assert r.status_code == 200, r.text
    row = r.json()
    ctx["made"].append(row["id"])
    return row


def _patch(row_id, **fields):
    return requests.patch(f"{API}/work-items/{row_id}", headers=MEMBER, json=fields)


def test_new_ideation_row_covers_its_one_project(ctx):
    row = _new_row(ctx)
    assert row["project_ids"] == [ctx["projects"][0]]
    assert row["quantity"] == 1


def test_ticking_projects_sets_quantity_and_first_project(ctx):
    row = _new_row(ctx)
    p1, p2, p3 = ctx["projects"]
    r = _patch(row["id"], project_ids=[p2, p3, p1])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["project_ids"] == [p2, p3, p1]
    assert body["project_id"] == p2
    assert body["quantity"] == 3
    assert body["client_id"] == ctx["client"]
    assert len(body["quantity_items"]) == 3


def test_each_project_keeps_its_own_time_when_others_are_unticked(ctx):
    row = _new_row(ctx)
    p1, p2, p3 = ctx["projects"]
    _patch(row["id"], project_ids=[p1, p2, p3])
    r = _patch(row["id"], quantity_items=[20, None, 45])
    assert r.status_code == 200, r.text
    # A project with no time typed counts as the worker's benchmark, if they have one.
    assert r.json()["time_taken_minutes"] >= 65

    # Unticking the middle project takes its (empty) slot, not the next one's time.
    r = _patch(row["id"], project_ids=[p1, p3])
    body = r.json()
    assert body["quantity"] == 2
    assert body["quantity_items"] == [20, 45]
    assert body["time_taken_minutes"] == 65

    # Unticking the first project hands the row to the next one.
    r = _patch(row["id"], project_ids=[p3])
    body = r.json()
    assert body["project_id"] == p3
    assert body["quantity_items"] == [45]
    assert body["time_taken_minutes"] == 45


def test_quantity_cannot_be_typed_on_an_ideation_row(ctx):
    row = _new_row(ctx)
    r = _patch(row["id"], project_ids=ctx["projects"][:2])
    assert r.status_code == 200
    r = _patch(row["id"], quantity=9)
    assert r.status_code == 200
    assert r.json()["quantity"] == 2


def test_setting_one_project_the_old_way_replaces_the_list(ctx):
    row = _new_row(ctx)
    p1, p2, p3 = ctx["projects"]
    _patch(row["id"], project_ids=[p1, p2, p3])
    # The same first project (e.g. a paste of what is already there) keeps the list.
    assert _patch(row["id"], project_id=p1).json()["project_ids"] == [p1, p2, p3]
    body = _patch(row["id"], project_id=p2).json()
    assert body["project_ids"] == [p2]
    assert body["quantity"] == 1


def test_projects_must_belong_to_one_client(ctx):
    row = _new_row(ctx)
    r = _patch(row["id"], project_ids=[ctx["projects"][0], ctx["outsider"]])
    assert r.status_code == 400
    assert "same client" in r.json()["detail"]


def test_unknown_project_is_refused(ctx):
    row = _new_row(ctx)
    r = _patch(row["id"], project_ids=[ctx["projects"][0], "no-such-project"])
    assert r.status_code == 400


def test_every_campaign_ideation_plan_type_works_the_same(ctx):
    row = _new_row(ctx, deliverable_type=KEYWORDS)
    r = _patch(row["id"], project_ids=ctx["projects"])
    assert r.status_code == 200
    assert r.json()["quantity"] == 3


def test_other_types_cannot_cover_several_projects(ctx):
    row = _new_row(ctx, deliverable_type="Carousel")
    r = _patch(row["id"], project_ids=ctx["projects"][:2])
    assert r.status_code == 400


def test_changing_to_another_type_drops_the_list_and_the_times(ctx):
    row = _new_row(ctx)
    p1, p2, p3 = ctx["projects"]
    _patch(row["id"], project_ids=[p1, p2, p3])
    _patch(row["id"], quantity_items=[10, 20, 30])

    body = _patch(row["id"], deliverable_type="Carousel").json()
    assert body["project_ids"] == []
    assert body["quantity"] == 1
    assert body["quantity_items"] == []
    assert body["project_id"] == p1


def test_work_sheet_project_filter_finds_a_row_by_any_of_its_projects(ctx):
    row = _new_row(ctx)
    p1, p2, p3 = ctx["projects"]
    _patch(row["id"], project_ids=[p1, p2, p3])
    r = requests.get(f"{API}/work-items", headers=MEMBER, params={"project_id": p3})
    assert r.status_code == 200
    assert row["id"] in {item["id"] for item in r.json()}
