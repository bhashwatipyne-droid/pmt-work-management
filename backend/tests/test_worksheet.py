"""Backend tests for the WorkSheet app: users, options, work-items CRUD, permissions."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://task-sheet-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin-1"
MGR1 = "manager-1"
MGR2 = "manager-2"
MEM1 = "member-1"
MEM2 = "member-2"


def _h(uid):
    return {"X-User-Id": uid, "Content-Type": "application/json"}


# ---------- Users & options ----------
def test_list_users_returns_6_seeded():
    r = requests.get(f"{API}/users")
    assert r.status_code == 200
    data = r.json()
    ids = {u["id"] for u in data}
    assert {"admin-1", "manager-1", "manager-2", "member-1", "member-2", "member-3"}.issubset(ids)
    assert len(data) == 6


def test_get_options():
    r = requests.get(f"{API}/config/options")
    assert r.status_code == 200
    d = r.json()
    assert "Closed" in d["statuses"]
    assert "Closed" not in d["member_forward_statuses"]
    assert "Ready for Review" in d["member_forward_statuses"]
    assert len(d["deliverable_types"]) >= 1


# ---------- Auth header ----------
def test_missing_user_header_401():
    r = requests.get(f"{API}/work-items")
    assert r.status_code == 401


def test_unknown_user_404():
    r = requests.get(f"{API}/work-items", headers=_h("nope"))
    assert r.status_code == 404


# ---------- CRUD ----------
@pytest.fixture
def admin_item():
    r = requests.post(f"{API}/work-items", headers=_h(ADMIN), json={
        "deliverable_name": "TEST_admin_row",
        "deliverable_type": "Blog Post",
        "creator_id": MEM1,
        "reviewer_id": MGR1,
        "remarks": "TEST_remark",
    })
    assert r.status_code == 200, r.text
    item = r.json()
    yield item
    requests.delete(f"{API}/work-items/{item['id']}", headers=_h(ADMIN))


def test_admin_create_and_get(admin_item):
    assert admin_item["creator_id"] == MEM1
    assert admin_item["status"] == "Not Started"
    assert admin_item["month"] == admin_item["work_date"][:7]

    # verify GET
    r = requests.get(f"{API}/work-items", headers=_h(ADMIN))
    assert r.status_code == 200
    assert any(i["id"] == admin_item["id"] for i in r.json())


def test_admin_can_set_closed(admin_item):
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(ADMIN),
                       json={"status": "Closed"})
    assert r.status_code == 200
    assert r.json()["status"] == "Closed"


def test_member_sees_only_own_rows(admin_item):
    # admin_item has creator = MEM1
    r_mem1 = requests.get(f"{API}/work-items", headers=_h(MEM1))
    r_mem2 = requests.get(f"{API}/work-items", headers=_h(MEM2))
    assert r_mem1.status_code == 200 and r_mem2.status_code == 200
    assert any(i["id"] == admin_item["id"] for i in r_mem1.json())
    assert not any(i["id"] == admin_item["id"] for i in r_mem2.json())


def test_member_create_forces_self_as_creator():
    r = requests.post(f"{API}/work-items", headers=_h(MEM2), json={
        "deliverable_name": "TEST_mem_row",
        "creator_id": MEM1,  # trying to spoof
    })
    assert r.status_code == 200
    item = r.json()
    assert item["creator_id"] == MEM2
    requests.delete(f"{API}/work-items/{item['id']}", headers=_h(ADMIN))


def test_member_cannot_set_closed(admin_item):
    # admin_item creator is MEM1
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM1),
                       json={"status": "Closed"})
    assert r.status_code == 403


def test_member_cannot_set_changes_requested(admin_item):
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM1),
                       json={"status": "Changes Requested"})
    assert r.status_code == 403


def test_member_can_set_ready_for_review(admin_item):
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM1),
                       json={"status": "Ready for Review", "remarks": "done"})
    assert r.status_code == 200
    assert r.json()["status"] == "Ready for Review"
    assert r.json()["remarks"] == "done"


def test_member_cannot_edit_others_row(admin_item):
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM2),
                       json={"remarks": "hack"})
    assert r.status_code == 403


def test_member_restricted_fields_ignored(admin_item):
    # Member tries to change deliverable_name (restricted) — should be silently ignored
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM1),
                       json={"deliverable_name": "HACKED", "version": "v2"})
    assert r.status_code == 200
    body = r.json()
    assert body["deliverable_name"] == "TEST_admin_row"  # unchanged
    assert body["version"] == "v2"  # allowed


def test_manager_cannot_delete(admin_item):
    r = requests.delete(f"{API}/work-items/{admin_item['id']}", headers=_h(MGR1))
    assert r.status_code == 403


def test_member_cannot_delete(admin_item):
    r = requests.delete(f"{API}/work-items/{admin_item['id']}", headers=_h(MEM1))
    assert r.status_code == 403


def test_admin_delete_and_verify_gone():
    r = requests.post(f"{API}/work-items", headers=_h(ADMIN), json={"deliverable_name": "TEST_del"})
    item_id = r.json()["id"]
    d = requests.delete(f"{API}/work-items/{item_id}", headers=_h(ADMIN))
    assert d.status_code == 200
    # A second delete should 404
    d2 = requests.delete(f"{API}/work-items/{item_id}", headers=_h(ADMIN))
    assert d2.status_code == 404


def test_manager_can_edit_all_fields(admin_item):
    r = requests.patch(f"{API}/work-items/{admin_item['id']}", headers=_h(MGR1),
                       json={"deliverable_name": "TEST_mgr_edit", "status": "Changes Requested"})
    assert r.status_code == 200
    body = r.json()
    assert body["deliverable_name"] == "TEST_mgr_edit"
    assert body["status"] == "Changes Requested"


def test_manager_sees_all_rows(admin_item):
    r = requests.get(f"{API}/work-items", headers=_h(MGR2))
    assert r.status_code == 200
    assert any(i["id"] == admin_item["id"] for i in r.json())


# ---------- Filters ----------
def test_filters_search_and_status():
    # create a distinct row
    r = requests.post(f"{API}/work-items", headers=_h(ADMIN), json={
        "deliverable_name": "TEST_UNIQUE_XYZ123",
        "status": "Ongoing",
        "deliverable_type": "Video",
        "work_category": "Non-Core",
    })
    item_id = r.json()["id"]
    try:
        s = requests.get(f"{API}/work-items", headers=_h(ADMIN),
                         params={"search": "UNIQUE_XYZ123"})
        assert s.status_code == 200
        assert len(s.json()) == 1 and s.json()[0]["id"] == item_id

        s2 = requests.get(f"{API}/work-items", headers=_h(ADMIN),
                          params={"status": "Ongoing", "deliverable_type": "Video", "work_category": "Non-Core"})
        assert s2.status_code == 200
        assert any(i["id"] == item_id for i in s2.json())
    finally:
        requests.delete(f"{API}/work-items/{item_id}", headers=_h(ADMIN))


def test_no_mongo_id_leaks():
    r = requests.get(f"{API}/work-items", headers=_h(ADMIN))
    for i in r.json():
        assert "_id" not in i
    r2 = requests.get(f"{API}/users")
    for u in r2.json():
        assert "_id" not in u
