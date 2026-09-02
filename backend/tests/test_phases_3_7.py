"""Phase 3-7 backend tests: users mgmt, approvals, dashboard overview, work-item project linkage."""
import os
import pytest
import requests

BASE_URL = os.environ['REACT_APP_BACKEND_URL'].rstrip('/') if 'REACT_APP_BACKEND_URL' in os.environ else None
if not BASE_URL:
    # Fall back: read from frontend/.env
    with open('/app/frontend/.env') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BASE_URL = line.split('=', 1)[1].strip().rstrip('/')
                break

API = f"{BASE_URL}/api"

ADMIN = {"X-User-Id": "admin-1"}
MGR = {"X-User-Id": "manager-1"}
MBR1 = {"X-User-Id": "member-1"}
MBR2 = {"X-User-Id": "member-2"}


# ---- Config Options ----
class TestConfigOptions:
    def test_options_includes_new_fields(self):
        r = requests.get(f"{API}/config/options")
        assert r.status_code == 200
        d = r.json()
        assert d["departments"] == ["Content", "Design", "Animation", "Finish", "Administration"]
        assert set(d["roles"]) == {"admin", "manager", "member"}
        assert "Changes Requested" in d["stage_statuses"]


# ---- Users mgmt ----
class TestUsersMgmt:
    created_ids = []

    def test_create_user_admin(self):
        r = requests.post(f"{API}/users", headers=ADMIN, json={
            "name": "TEST_User1", "email": "test1@x.com", "role": "member", "department": "Design"
        })
        assert r.status_code == 200, r.text
        u = r.json()
        assert u["name"] == "TEST_User1"
        assert u["role"] == "member"
        assert u["department"] == "Design"
        assert u["active"] is True
        TestUsersMgmt.created_ids.append(u["id"])
        # verify via GET
        lst = requests.get(f"{API}/users").json()
        assert any(x["id"] == u["id"] for x in lst)

    def test_create_user_invalid_role(self):
        r = requests.post(f"{API}/users", headers=ADMIN, json={"name": "TEST_bad", "role": "boss"})
        assert r.status_code == 400

    def test_create_user_invalid_department(self):
        r = requests.post(f"{API}/users", headers=ADMIN, json={"name": "TEST_bad2", "role": "member", "department": "Marketing"})
        assert r.status_code == 400

    def test_create_user_nonadmin_403(self):
        r = requests.post(f"{API}/users", headers=MGR, json={"name": "x", "role": "member"})
        assert r.status_code == 403
        r = requests.post(f"{API}/users", headers=MBR1, json={"name": "x", "role": "member"})
        assert r.status_code == 403

    def test_patch_user_admin(self):
        uid = TestUsersMgmt.created_ids[0]
        r = requests.patch(f"{API}/users/{uid}", headers=ADMIN, json={"department": "Animation", "role": "manager"})
        assert r.status_code == 200
        assert r.json()["department"] == "Animation"
        assert r.json()["role"] == "manager"

    def test_patch_user_invalid_role(self):
        uid = TestUsersMgmt.created_ids[0]
        r = requests.patch(f"{API}/users/{uid}", headers=ADMIN, json={"role": "boss"})
        assert r.status_code == 400

    def test_patch_user_invalid_department(self):
        uid = TestUsersMgmt.created_ids[0]
        r = requests.patch(f"{API}/users/{uid}", headers=ADMIN, json={"department": "Sales"})
        assert r.status_code == 400

    def test_patch_user_nonadmin_403(self):
        uid = TestUsersMgmt.created_ids[0]
        r = requests.patch(f"{API}/users/{uid}", headers=MGR, json={"department": "Content"})
        assert r.status_code == 403
        r = requests.patch(f"{API}/users/{uid}", headers=MBR1, json={"department": "Content"})
        assert r.status_code == 403

    def test_seeded_users_have_email_dept_active(self):
        lst = requests.get(f"{API}/users").json()
        seeded = [u for u in lst if u["id"] in ("admin-1", "manager-1", "member-1")]
        for u in seeded:
            assert u.get("email"), u
            assert u.get("department"), u
            assert u.get("active") is True


# ---- Approvals ----
@pytest.fixture(scope="module")
def project_and_deliv():
    # Create a fresh client + project + deliverable for approval flow
    c = requests.post(f"{API}/clients", headers=ADMIN, json={"name": "TEST_Client_A"}).json()
    proj = requests.post(f"{API}/projects", headers=ADMIN, json={
        "name": "TEST_ApprovalProj", "client_id": c["id"],
        "start_date": "2026-01-01", "end_date": "2026-02-01",
        "deliverables": [{"name": "TEST_Deliv1"}]
    }).json()
    deliv_id = proj["deliverables"][0]["id"]
    # move to Ready for Review
    requests.patch(f"{API}/deliverables/{deliv_id}", headers=ADMIN, json={"stage_status": "Ready for Review"})
    yield {"project": proj, "deliv_id": deliv_id, "client_id": c["id"]}
    # cleanup
    requests.delete(f"{API}/projects/{proj['id']}", headers=ADMIN)


class TestApprovals:
    def test_approvals_lists_ready_only(self, project_and_deliv):
        r = requests.get(f"{API}/approvals", headers=ADMIN)
        assert r.status_code == 200
        items = r.json()
        assert any(d["id"] == project_and_deliv["deliv_id"] for d in items)
        for it in items:
            assert it["stage_status"] == "Ready for Review"
            assert "project_name" in it and "project_code" in it and "client_name" in it and "owner_name" in it

    def test_approvals_requires_auth(self):
        r = requests.get(f"{API}/approvals")
        assert r.status_code == 401

    def test_approvals_member_can_read(self, project_and_deliv):
        r = requests.get(f"{API}/approvals", headers=MBR1)
        assert r.status_code == 200

    def test_approve_advances_stage(self, project_and_deliv):
        did = project_and_deliv["deliv_id"]
        # First approve: Content -> Design
        r = requests.post(f"{API}/deliverables/{did}/approve", headers=MGR, json={"note": "ok"})
        assert r.status_code == 200
        d = r.json()
        assert d["current_stage"] == "Design"
        assert d["stage_status"] == "Not Started"
        assert d["last_review_action"] == "approved"
        assert d["last_reviewer_id"] == "manager-1"
        assert d["last_review_note"] == "ok"
        # move to Ready for Review then approve -> Animate
        requests.patch(f"{API}/deliverables/{did}", headers=ADMIN, json={"stage_status": "Ready for Review"})
        r = requests.post(f"{API}/deliverables/{did}/approve", headers=ADMIN, json={})
        assert r.json()["current_stage"] == "Animate"
        requests.patch(f"{API}/deliverables/{did}", headers=ADMIN, json={"stage_status": "Ready for Review"})
        r = requests.post(f"{API}/deliverables/{did}/approve", headers=ADMIN, json={})
        assert r.json()["current_stage"] == "Finish"
        # final approve at Finish -> Completed
        requests.patch(f"{API}/deliverables/{did}", headers=ADMIN, json={"stage_status": "Ready for Review"})
        r = requests.post(f"{API}/deliverables/{did}/approve", headers=ADMIN, json={})
        assert r.json()["stage_status"] == "Completed"

    def test_approve_member_forbidden(self, project_and_deliv):
        did = project_and_deliv["deliv_id"]
        r = requests.post(f"{API}/deliverables/{did}/approve", headers=MBR1, json={})
        assert r.status_code == 403

    def test_reject_sets_changes_requested(self, project_and_deliv):
        did = project_and_deliv["deliv_id"]
        requests.patch(f"{API}/deliverables/{did}", headers=ADMIN, json={"stage_status": "Ready for Review", "current_stage": "Content"})
        r = requests.post(f"{API}/deliverables/{did}/reject", headers=MGR, json={"note": "redo"})
        assert r.status_code == 200
        d = r.json()
        assert d["stage_status"] == "Changes Requested"
        assert d["last_review_action"] == "rejected"
        assert d["last_review_note"] == "redo"

    def test_reject_member_forbidden(self, project_and_deliv):
        did = project_and_deliv["deliv_id"]
        r = requests.post(f"{API}/deliverables/{did}/reject", headers=MBR1, json={})
        assert r.status_code == 403

    def test_approvals_excludes_changes_requested(self, project_and_deliv):
        did = project_and_deliv["deliv_id"]
        # Set to Changes Requested
        requests.patch(f"{API}/deliverables/{did}", headers=ADMIN, json={"stage_status": "Changes Requested"})
        r = requests.get(f"{API}/approvals", headers=ADMIN).json()
        assert not any(d["id"] == did for d in r)


# ---- Dashboard Overview ----
class TestDashboardOverview:
    def test_admin_overview(self):
        r = requests.get(f"{API}/dashboard/overview", headers=ADMIN)
        assert r.status_code == 200
        d = r.json()
        for k in ["active_projects", "in_rework", "completed_projects", "planning_projects",
                  "total_projects", "total_deliverables", "deliv_stage_counts", "needs_review",
                  "due_this_week", "total_hours_logged", "total_work_items", "project_status_counts"]:
            assert k in d, f"missing {k}"
        assert set(d["deliv_stage_counts"].keys()) == {"Content", "Design", "Animate", "Finish"}

    def test_manager_403(self):
        r = requests.get(f"{API}/dashboard/overview", headers=MGR)
        assert r.status_code == 403

    def test_member_403(self):
        r = requests.get(f"{API}/dashboard/overview", headers=MBR1)
        assert r.status_code == 403


# ---- WorkItem project/deliverable/stage ----
@pytest.fixture(scope="module")
def worksheet_ctx():
    c = requests.post(f"{API}/clients", headers=ADMIN, json={"name": "TEST_Client_WS"}).json()
    proj = requests.post(f"{API}/projects", headers=ADMIN, json={
        "name": "TEST_WSProj", "client_id": c["id"],
        "start_date": "2026-01-01", "end_date": "2026-02-01",
        "deliverables": [{"name": "TEST_WSDeliv"}]
    }).json()
    yield {"project_id": proj["id"], "deliv_id": proj["deliverables"][0]["id"]}
    requests.delete(f"{API}/projects/{proj['id']}", headers=ADMIN)


class TestWorkItemLinkage:
    created = {}

    def test_create_with_linkage(self, worksheet_ctx):
        r = requests.post(f"{API}/work-items", headers=MBR1, json={
            "deliverable_name": "TEST_row",
            "project_id": worksheet_ctx["project_id"],
            "deliverable_id": worksheet_ctx["deliv_id"],
            "stage": "Content",
        })
        assert r.status_code == 200, r.text
        w = r.json()
        assert w["project_id"] == worksheet_ctx["project_id"]
        assert w["deliverable_id"] == worksheet_ctx["deliv_id"]
        assert w["stage"] == "Content"
        assert w["creator_id"] == "member-1"
        TestWorkItemLinkage.created["mine"] = w["id"]

    def test_patch_invalid_stage(self):
        wid = TestWorkItemLinkage.created["mine"]
        r = requests.patch(f"{API}/work-items/{wid}", headers=MBR1, json={"stage": "Bogus"})
        assert r.status_code == 400

    def test_patch_own_linkage_member_ok(self, worksheet_ctx):
        wid = TestWorkItemLinkage.created["mine"]
        r = requests.patch(f"{API}/work-items/{wid}", headers=MBR1, json={"stage": "Design"})
        assert r.status_code == 200
        assert r.json()["stage"] == "Design"

    def test_patch_other_row_member_403(self):
        # admin creates row as another member
        r = requests.post(f"{API}/work-items", headers=ADMIN, json={
            "deliverable_name": "TEST_other", "creator_id": "member-2"
        })
        other_id = r.json()["id"]
        TestWorkItemLinkage.created["other"] = other_id
        r = requests.patch(f"{API}/work-items/{other_id}", headers=MBR1, json={"stage": "Design"})
        assert r.status_code == 403

    def test_cleanup(self):
        for wid in TestWorkItemLinkage.created.values():
            requests.delete(f"{API}/work-items/{wid}", headers=ADMIN)
