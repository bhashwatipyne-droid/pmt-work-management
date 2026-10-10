"""Campaign Ideation Plan rows cover several deliverables of one project.

One Content row of a "Campaign Ideation Plan (...)" type lists every deliverable
of its project the ideation covers (deliverable_ids). Its quantity is the number
of deliverables, and quantity_items[i] is the time for deliverable_ids[i]. Runs
against a live backend like the other work-sheet tests."""
import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://task-sheet-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"X-User-Id": "admin-1"}
MEMBER = {"X-User-Id": "member-1"}

PEER = "Campaign Ideation Plan (Content Peer Analysis)"
KEYWORDS = "Campaign Ideation Plan (Includes Keywords)"


@pytest.fixture(scope="module")
def ctx():
    client = requests.post(f"{API}/clients", headers=ADMIN, json={"name": "TEST_Client_Ideation"}).json()
    project = requests.post(f"{API}/projects", headers=ADMIN, json={
        "name": "TEST_Ideation_Project", "client_id": client["id"],
        "start_date": "2026-01-01", "end_date": "2026-02-01",
        "deliverables": [{"name": f"TEST_Ideation_D{i}"} for i in range(1, 5)],
    }).json()
    other = requests.post(f"{API}/projects", headers=ADMIN, json={
        "name": "TEST_Ideation_Other", "client_id": client["id"],
        "start_date": "2026-01-01", "end_date": "2026-02-01",
        "deliverables": [{"name": "TEST_Ideation_Elsewhere"}],
    }).json()
    made = []
    yield {
        "project": project["id"],
        "deliverables": [d["id"] for d in project["deliverables"]],
        "other_project": other["id"],
        "outsider": other["deliverables"][0]["id"],
        "made": made,
    }
    for item_id in made:
        requests.delete(f"{API}/work-items/{item_id}", headers=ADMIN)
    for pid in (project["id"], other["id"]):
        requests.delete(f"{API}/projects/{pid}", headers=ADMIN)


def _new_row(ctx, **extra):
    r = requests.post(f"{API}/work-items", headers=MEMBER, json={
        "deliverable_name": "TEST_ideation",
        "deliverable_type": PEER,
        "stage": "Content",
        "project_id": ctx["project"],
        **extra,
    })
    assert r.status_code == 200, r.text
    row = r.json()
    ctx["made"].append(row["id"])
    return row


def _patch(row_id, **fields):
    return requests.patch(f"{API}/work-items/{row_id}", headers=MEMBER, json=fields)


def test_new_ideation_row_has_one_unit_and_no_deliverables(ctx):
    row = _new_row(ctx)
    assert row["deliverable_ids"] == []
    assert row["quantity"] == 1


def test_ticking_deliverables_sets_quantity_and_first_deliverable(ctx):
    row = _new_row(ctx)
    d1, d2, d3, _ = ctx["deliverables"]
    r = _patch(row["id"], deliverable_ids=[d2, d3, d1])
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deliverable_ids"] == [d2, d3, d1]
    assert body["deliverable_id"] == d2
    assert body["project_id"] == ctx["project"]
    assert body["quantity"] == 3
    assert len(body["quantity_items"]) == 3


def test_each_deliverable_keeps_its_own_time_when_others_are_unticked(ctx):
    row = _new_row(ctx)
    d1, d2, d3, _ = ctx["deliverables"]
    _patch(row["id"], deliverable_ids=[d1, d2, d3])
    r = _patch(row["id"], quantity_items=[20, None, 45])
    assert r.status_code == 200, r.text
    # A deliverable with no time typed counts as the worker's benchmark, if they have one.
    assert r.json()["time_taken_minutes"] >= 65

    # Unticking the middle deliverable takes its (empty) slot, not the next one's time.
    body = _patch(row["id"], deliverable_ids=[d1, d3]).json()
    assert body["quantity"] == 2
    assert body["quantity_items"] == [20, 45]
    assert body["time_taken_minutes"] == 65

    # Unticking the first hands the row to the next one.
    body = _patch(row["id"], deliverable_ids=[d3]).json()
    assert body["deliverable_id"] == d3
    assert body["quantity_items"] == [45]
    assert body["time_taken_minutes"] == 45


def test_quantity_cannot_be_typed_on_an_ideation_row(ctx):
    row = _new_row(ctx)
    _patch(row["id"], deliverable_ids=ctx["deliverables"][:2])
    r = _patch(row["id"], quantity=9)
    assert r.status_code == 200
    assert r.json()["quantity"] == 2


def test_setting_one_deliverable_the_old_way_replaces_the_list(ctx):
    row = _new_row(ctx)
    d1, d2, d3, _ = ctx["deliverables"]
    _patch(row["id"], deliverable_ids=[d1, d2, d3])
    # The same first deliverable (e.g. a paste of what is already there) keeps the list.
    assert _patch(row["id"], deliverable_id=d1).json()["deliverable_ids"] == [d1, d2, d3]
    body = _patch(row["id"], deliverable_id=d2).json()
    assert body["deliverable_ids"] == [d2]
    assert body["quantity"] == 1


def test_deliverables_must_belong_to_the_rows_project(ctx):
    row = _new_row(ctx)
    r = _patch(row["id"], deliverable_ids=[ctx["deliverables"][0], ctx["outsider"]])
    assert r.status_code == 400
    assert "project" in r.json()["detail"]


def test_unknown_deliverable_is_refused(ctx):
    row = _new_row(ctx)
    r = _patch(row["id"], deliverable_ids=[ctx["deliverables"][0], "no-such-deliverable"])
    assert r.status_code == 400


def test_moving_the_row_to_another_project_empties_the_list(ctx):
    row = _new_row(ctx)
    _patch(row["id"], deliverable_ids=ctx["deliverables"][:3], quantity_items=[10, 20, 30])
    body = _patch(row["id"], project_id=ctx["other_project"]).json()
    assert body["deliverable_ids"] == []
    assert body["deliverable_id"] is None
    assert body["quantity"] == 1
    assert body["quantity_items"] == []


def test_every_campaign_ideation_plan_type_works_the_same(ctx):
    row = _new_row(ctx, deliverable_type=KEYWORDS)
    r = _patch(row["id"], deliverable_ids=ctx["deliverables"])
    assert r.status_code == 200
    assert r.json()["quantity"] == 4


def test_other_types_cannot_cover_several_deliverables(ctx):
    row = _new_row(ctx, deliverable_type="Carousel")
    r = _patch(row["id"], deliverable_ids=ctx["deliverables"][:2])
    assert r.status_code == 400


def test_changing_to_another_type_drops_the_list_and_the_times(ctx):
    row = _new_row(ctx)
    d1, d2, d3, _ = ctx["deliverables"]
    _patch(row["id"], deliverable_ids=[d1, d2, d3])
    _patch(row["id"], quantity_items=[10, 20, 30])

    body = _patch(row["id"], deliverable_type="Carousel").json()
    assert body["deliverable_ids"] == []
    assert body["quantity"] == 1
    assert body["quantity_items"] == []
    assert body["deliverable_id"] == d1


def test_work_sheet_deliverable_filter_finds_a_row_by_any_of_its_deliverables(ctx):
    row = _new_row(ctx)
    d1, d2, d3, _ = ctx["deliverables"]
    _patch(row["id"], deliverable_ids=[d1, d2, d3])
    r = requests.get(f"{API}/work-items", headers=MEMBER, params={"deliverable_id": d3})
    assert r.status_code == 200
    assert row["id"] in {item["id"] for item in r.json()}
