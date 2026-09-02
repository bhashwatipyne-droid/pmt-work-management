"""
Backend tests for iteration_6 permission/restriction changes:
- Admin view-only on Work Sheet (create/bulk-create blocked with 403)
- Manager cross-department PATCH blocked (403), same-dept allowed
- Member PATCH restricted to own rows only
- GET /api/work-items returns ALL items regardless of acting user role
- approve-deliverable flow (used by "Deliverable Closed" modal)
- Admin edit deliverable ignores read-only stage/stage_status if omitted
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin-1"
MGR_CONTENT = "manager-1"
MGR_DESIGN = "manager-2"
MEM_CONTENT = "member-1"
MEM_DESIGN = "member-2"
MEM_ANIM = "member-3"


def H(uid):
    return {"X-User-Id": uid, "Content-Type": "application/json"}


created_ids = []
created_projects = []
created_deliverables = []


def _create_work(uid, extra=None):
    payload = {"deliverable_name": f"TEST_{uuid.uuid4().hex[:6]}", "remarks": "iter6"}
    if extra:
        payload.update(extra)
    r = requests.post(f"{API}/work-items", json=payload, headers=H(uid))
    return r


# --- Admin view-only ---
class TestAdminViewOnly:
    def test_admin_create_blocked(self):
        r = _create_work(ADMIN)
        assert r.status_code == 403
        assert "view-only" in r.json().get("detail", "").lower()

    def test_admin_bulk_create_blocked(self):
        r = requests.post(f"{API}/work-items/bulk-create", json={"count": 2}, headers=H(ADMIN))
        assert r.status_code == 403

    def test_admin_patch_blocked(self):
        # create as member first
        r = _create_work(MEM_CONTENT)
        assert r.status_code == 200, r.text
        item_id = r.json()["id"]
        created_ids.append(item_id)
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "admin edit"}, headers=H(ADMIN))
        assert pr.status_code == 403


# --- GET returns all rows for everyone ---
class TestListAll:
    def test_get_all_roles_see_all_items(self):
        # create 2 items owned by different members
        r1 = _create_work(MEM_CONTENT)
        r2 = _create_work(MEM_DESIGN)
        assert r1.status_code == 200 and r2.status_code == 200
        id1, id2 = r1.json()["id"], r2.json()["id"]
        created_ids.extend([id1, id2])

        for uid in [ADMIN, MGR_CONTENT, MEM_CONTENT, MEM_DESIGN, MEM_ANIM]:
            resp = requests.get(f"{API}/work-items", headers=H(uid))
            assert resp.status_code == 200
            ids = {it["id"] for it in resp.json()}
            assert id1 in ids and id2 in ids, f"user {uid} does not see all rows"


# --- Manager cross-department restriction ---
class TestManagerDeptScope:
    def test_manager_same_dept_can_edit(self):
        r = _create_work(MEM_CONTENT)  # Content dept
        item_id = r.json()["id"]
        created_ids.append(item_id)
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "content-mgr edit"}, headers=H(MGR_CONTENT))
        assert pr.status_code == 200, pr.text
        assert pr.json()["remarks"] == "content-mgr edit"

    def test_manager_diff_dept_blocked(self):
        r = _create_work(MEM_DESIGN)  # Design
        item_id = r.json()["id"]
        created_ids.append(item_id)
        # Content manager tries to edit a Design row
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "cross"}, headers=H(MGR_CONTENT))
        assert pr.status_code == 403

    def test_manager_animation_row_blocked_for_content(self):
        r = _create_work(MEM_ANIM)
        item_id = r.json()["id"]
        created_ids.append(item_id)
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "x"}, headers=H(MGR_CONTENT))
        assert pr.status_code == 403


# --- Member own-rows only ---
class TestMemberOwnOnly:
    def test_member_can_edit_own(self):
        r = _create_work(MEM_CONTENT)
        item_id = r.json()["id"]
        created_ids.append(item_id)
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "self"}, headers=H(MEM_CONTENT))
        assert pr.status_code == 200
        assert pr.json()["remarks"] == "self"

    def test_member_cannot_edit_other_same_dept(self):
        # member-1 tries to edit a row from manager-1 (both Content dept)
        r = _create_work(MGR_CONTENT)
        item_id = r.json()["id"]
        created_ids.append(item_id)
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"remarks": "steal"}, headers=H(MEM_CONTENT))
        assert pr.status_code == 403


# --- Deliverable Link free text persistence ---
class TestDeliverableLink:
    def test_link_persists(self):
        r = _create_work(MEM_CONTENT)
        item_id = r.json()["id"]
        created_ids.append(item_id)
        url = "https://drive.google.com/test-link-123"
        pr = requests.patch(f"{API}/work-items/{item_id}", json={"deliverable_link": url}, headers=H(MEM_CONTENT))
        assert pr.status_code == 200
        # re-fetch
        got = requests.get(f"{API}/work-items", headers=H(MEM_CONTENT)).json()
        row = next(x for x in got if x["id"] == item_id)
        assert row["deliverable_link"] == url


# --- Approve deliverable stage progression ---
class TestApproveDeliverable:
    project_id = None
    deliv_id = None

    def _setup_project(self):
        r = requests.post(
            f"{API}/projects",
            json={
                "name": f"TEST_iter6_{uuid.uuid4().hex[:6]}",
                "client_id": "client-amfi",
                "start_date": "2026-01-01",
                "end_date": "2026-02-01",
                "deliverables": [{"name": "TEST_Deliv", "type": ""}],
            },
            headers=H(ADMIN),
        )
        assert r.status_code == 200, r.text
        proj = r.json()
        created_projects.append(proj["id"])
        deliv = proj["deliverables"][0]
        created_deliverables.append(deliv["id"])
        return proj["id"], deliv["id"]

    def test_stage_progression_via_manager(self):
        pid, did = self._setup_project()
        TestApproveDeliverable.project_id = pid
        TestApproveDeliverable.deliv_id = did
        expected = [
            ("Content", "Design"),
            ("Design", "Animate"),
            ("Animate", "Finish"),
        ]
        for _, nxt in expected:
            r = requests.post(f"{API}/deliverables/{did}/approve", json={}, headers=H(MGR_CONTENT))
            assert r.status_code == 200, r.text
            assert r.json()["current_stage"] == nxt
        # Final approve on Finish -> Completed
        r = requests.post(f"{API}/deliverables/{did}/approve", json={}, headers=H(MGR_CONTENT))
        assert r.status_code == 200
        assert r.json()["current_stage"] == "Finish"
        assert r.json()["stage_status"] == "Completed"

    def test_member_cannot_approve(self):
        pid, did = self._setup_project()
        r = requests.post(f"{API}/deliverables/{did}/approve", json={}, headers=H(MEM_CONTENT))
        assert r.status_code == 403


# --- Deliverable edit does not require stage/stage_status ---
class TestDeliverableEdit:
    def test_admin_edit_without_stage_fields(self):
        # setup fresh project
        r = requests.post(
            f"{API}/projects",
            json={
                "name": f"TEST_edit_{uuid.uuid4().hex[:6]}",
                "client_id": "client-amfi",
                "start_date": "2026-01-01",
                "end_date": "2026-02-01",
                "deliverables": [{"name": "OrigName"}],
            },
            headers=H(ADMIN),
        )
        proj = r.json()
        created_projects.append(proj["id"])
        deliv = proj["deliverables"][0]
        created_deliverables.append(deliv["id"])

        pr = requests.patch(
            f"{API}/deliverables/{deliv['id']}",
            json={"name": "NewName"},
            headers=H(ADMIN),
        )
        assert pr.status_code == 200
        assert pr.json()["name"] == "NewName"
        assert pr.json()["current_stage"] == "Content"  # untouched


# --- Cleanup ---
def test_zzz_cleanup():
    if created_ids:
        r = requests.post(f"{API}/work-items/bulk-delete", json={"ids": created_ids}, headers=H(ADMIN))
        assert r.status_code == 200
    for pid in created_projects:
        requests.delete(f"{API}/projects/{pid}", headers=H(ADMIN))
