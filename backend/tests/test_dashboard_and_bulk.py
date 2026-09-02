"""Backend tests for new Dashboard endpoints and bulk actions."""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin-1"
MGR1 = "manager-1"
MEM1 = "member-1"
MEM2 = "member-2"


def _h(uid):
    return {"X-User-Id": uid, "Content-Type": "application/json"}


def _create(uid, **kwargs):
    r = requests.post(f"{API}/work-items", headers=_h(uid), json=kwargs)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- Dashboard permission ----------------
@pytest.mark.parametrize("path", ["/dashboard/summary", "/dashboard/team-summary", "/dashboard/attention-items"])
def test_dashboard_forbidden_for_manager(path):
    r = requests.get(f"{API}{path}", headers=_h(MGR1))
    assert r.status_code == 403


@pytest.mark.parametrize("path", ["/dashboard/summary", "/dashboard/team-summary", "/dashboard/attention-items"])
def test_dashboard_forbidden_for_member(path):
    r = requests.get(f"{API}{path}", headers=_h(MEM1))
    assert r.status_code == 403


@pytest.mark.parametrize("path", ["/dashboard/summary", "/dashboard/team-summary", "/dashboard/attention-items"])
def test_dashboard_missing_header_401(path):
    r = requests.get(f"{API}{path}")
    assert r.status_code == 401


# ---------------- Dashboard content ----------------
def test_dashboard_summary_structure():
    r = requests.get(f"{API}/dashboard/summary", headers=_h(ADMIN))
    assert r.status_code == 200
    d = r.json()
    for k in ["total_items", "status_counts", "total_hours_logged", "items_this_month",
              "closed_this_month", "active_members", "needs_attention_count"]:
        assert k in d
    assert d["total_items"] >= 0
    assert d["active_members"] >= 0
    assert d["needs_attention_count"] >= 0
    for s in ["Not Started", "Ongoing", "Ready for Review", "Changes Requested", "Closed"]:
        assert s in d["status_counts"]
        assert d["status_counts"][s] >= 0


def test_dashboard_team_summary_excludes_admin():
    r = requests.get(f"{API}/dashboard/team-summary", headers=_h(ADMIN))
    assert r.status_code == 200
    data = r.json()
    ids = [u["user_id"] for u in data]
    assert ADMIN not in ids
    assert "manager-1" in ids
    assert "member-1" in ids
    for u in data:
        assert "total_items" in u and "status_counts" in u and "total_hours" in u


def test_dashboard_attention_reflects_new_ready_for_review():
    # baseline
    r0 = requests.get(f"{API}/dashboard/summary", headers=_h(ADMIN))
    baseline = r0.json()["needs_attention_count"]

    # create as member and mark ready for review
    item = _create(MEM1, deliverable_name="TEST_attention_item")
    try:
        p = requests.patch(f"{API}/work-items/{item['id']}", headers=_h(MEM1),
                           json={"status": "Ready for Review"})
        assert p.status_code == 200

        r1 = requests.get(f"{API}/dashboard/summary", headers=_h(ADMIN))
        assert r1.json()["needs_attention_count"] == baseline + 1

        att = requests.get(f"{API}/dashboard/attention-items", headers=_h(ADMIN))
        assert att.status_code == 200
        rows = att.json()
        row = next((x for x in rows if x["id"] == item["id"]), None)
        assert row is not None
        assert row.get("creator_name") == "Sam Fernandes"
    finally:
        requests.delete(f"{API}/work-items/{item['id']}", headers=_h(ADMIN))


# ---------------- Bulk actions ----------------
def test_bulk_update_admin_two_rows_to_closed():
    a = _create(ADMIN, deliverable_name="TEST_bulk_a")
    b = _create(ADMIN, deliverable_name="TEST_bulk_b")
    try:
        r = requests.post(f"{API}/work-items/bulk-update", headers=_h(ADMIN),
                          json={"ids": [a["id"], b["id"]], "patch": {"status": "Closed"}})
        assert r.status_code == 200, r.text
        updated = r.json()
        assert len(updated) == 2
        assert all(u["status"] == "Closed" for u in updated)
    finally:
        requests.post(f"{API}/work-items/bulk-delete", headers=_h(ADMIN),
                      json={"ids": [a["id"], b["id"]]})


def test_bulk_delete_admin():
    a = _create(ADMIN, deliverable_name="TEST_bdel_a")
    b = _create(ADMIN, deliverable_name="TEST_bdel_b")
    r = requests.post(f"{API}/work-items/bulk-delete", headers=_h(ADMIN),
                      json={"ids": [a["id"], b["id"]]})
    assert r.status_code == 200
    assert r.json()["deleted_count"] == 2
    # verify gone
    all_items = requests.get(f"{API}/work-items", headers=_h(ADMIN)).json()
    ids = {i["id"] for i in all_items}
    assert a["id"] not in ids and b["id"] not in ids


def test_bulk_delete_manager_forbidden():
    r = requests.post(f"{API}/work-items/bulk-delete", headers=_h(MGR1),
                      json={"ids": ["nonexistent"]})
    assert r.status_code == 403


def test_bulk_delete_member_forbidden():
    r = requests.post(f"{API}/work-items/bulk-delete", headers=_h(MEM1),
                      json={"ids": ["nonexistent"]})
    assert r.status_code == 403


def test_bulk_update_member_skips_others_rows():
    # own row
    mine = _create(MEM1, deliverable_name="TEST_mem1_own")
    # other row created by member-2
    others = _create(MEM2, deliverable_name="TEST_mem2_own")
    try:
        # member-1 tries to bulk-update both to Ongoing;
        # the other user's row should raise 403 mid-loop OR be skipped.
        r = requests.post(f"{API}/work-items/bulk-update", headers=_h(MEM1),
                          json={"ids": [mine["id"], others["id"]], "patch": {"status": "Ongoing"}})
        # Current implementation raises 403 when it hits the other row,
        # meaning the whole request may 403 depending on ordering.
        # Acceptable behaviors: (a) 200 with only own row updated, (b) 403.
        assert r.status_code in (200, 403)

        # regardless, the OTHER row must NOT be updated
        o = requests.get(f"{API}/work-items", headers=_h(ADMIN)).json()
        other_row = next(x for x in o if x["id"] == others["id"])
        assert other_row["status"] == "Not Started"

        # own row: if 200 -> should be Ongoing. If 403 -> may be untouched.
        own = next(x for x in o if x["id"] == mine["id"])
        if r.status_code == 200:
            assert own["status"] == "Ongoing"
    finally:
        requests.post(f"{API}/work-items/bulk-delete", headers=_h(ADMIN),
                      json={"ids": [mine["id"], others["id"]]})


def test_bulk_update_member_own_rows_only_ongoing():
    a = _create(MEM1, deliverable_name="TEST_mem1_bulk_a")
    b = _create(MEM1, deliverable_name="TEST_mem1_bulk_b")
    try:
        r = requests.post(f"{API}/work-items/bulk-update", headers=_h(MEM1),
                          json={"ids": [a["id"], b["id"]], "patch": {"status": "Ongoing"}})
        assert r.status_code == 200, r.text
        assert all(u["status"] == "Ongoing" for u in r.json())
    finally:
        requests.post(f"{API}/work-items/bulk-delete", headers=_h(ADMIN),
                      json={"ids": [a["id"], b["id"]]})


def test_bulk_update_member_cannot_set_closed():
    a = _create(MEM1, deliverable_name="TEST_mem1_bulk_closed")
    try:
        r = requests.post(f"{API}/work-items/bulk-update", headers=_h(MEM1),
                          json={"ids": [a["id"]], "patch": {"status": "Closed"}})
        assert r.status_code == 403
    finally:
        requests.delete(f"{API}/work-items/{a['id']}", headers=_h(ADMIN))
