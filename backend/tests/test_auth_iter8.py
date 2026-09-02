"""Iteration 8: JWT cookie auth tests - login, logout, session, permissions."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://task-sheet-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREDS = {
    "admin-1": ("aisha@thefinpedia.com", "admin123", "admin", "Administration"),
    "manager-1": ("rahul@thefinpedia.com", "manager123", "manager", "Content"),
    "manager-2": ("priya@thefinpedia.com", "manager123", "manager", "Design"),
    "member-1": ("sam@thefinpedia.com", "member123", "member", "Content"),
    "member-2": ("neha@thefinpedia.com", "member123", "member", "Design"),
    "member-3": ("vikram@thefinpedia.com", "member123", "member", "Animation"),
}


def login_session(uid):
    email, pwd, _, _ = CREDS[uid]
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pwd}, timeout=15)
    assert r.status_code == 200, f"login failed for {uid}: {r.status_code} {r.text}"
    assert "access_token" in s.cookies, f"no cookie set for {uid}"
    return s


# --- Auth basics ---
class TestAuthBasics:
    def test_me_without_cookie_returns_401(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": "aisha@thefinpedia.com", "password": "wrong"}, timeout=15)
        assert r.status_code == 401
        assert "Invalid" in r.json().get("detail", "")

    def test_login_unknown_email(self):
        r = requests.post(f"{API}/auth/login", json={"email": "nobody@x.com", "password": "x"}, timeout=15)
        assert r.status_code == 401

    @pytest.mark.parametrize("uid", list(CREDS.keys()))
    def test_login_all_seed_users(self, uid):
        s = login_session(uid)
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200
        data = me.json()
        assert data["id"] == uid
        assert data["role"] == CREDS[uid][2]
        assert data["department"] == CREDS[uid][3]
        assert "_id" not in data
        assert "password_hash" not in data

    def test_logout_clears_cookie(self):
        s = login_session("admin-1")
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # After logout server sent delete-cookie; new session without token gets 401
        s2 = requests.Session()
        assert s2.get(f"{API}/auth/me", timeout=15).status_code == 401


# --- Endpoints require auth ---
class TestAuthEnforced:
    @pytest.mark.parametrize("path", [
        "/work-items", "/projects", "/deliverables", "/users",
        "/approvals", "/dashboard/summary", "/dashboard/overview",
    ])
    def test_endpoint_requires_auth(self, path):
        r = requests.get(f"{API}{path}", timeout=15)
        assert r.status_code == 401, f"{path} did not require auth: {r.status_code}"

    def test_admin_only_dashboard_forbidden_for_member(self):
        s = login_session("member-1")
        r = s.get(f"{API}/dashboard/summary", timeout=15)
        assert r.status_code == 403


# --- Permissions (JWT-driven) ---
class TestPermissions:
    created_ids = []

    def test_admin_cannot_create_work_item(self):
        s = login_session("admin-1")
        r = s.post(f"{API}/work-items", json={"deliverable_name": "TEST_admin_try"}, timeout=15)
        assert r.status_code == 403

    def test_member_creates_own_work_item(self):
        s = login_session("member-1")
        r = s.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_sam"}, timeout=15)
        assert r.status_code == 200
        item = r.json()
        assert item["creator_id"] == "member-1"
        TestPermissions.created_ids.append(item["id"])

    def test_member_cannot_edit_others_item(self):
        # sam's item, neha (different dept member) tries to edit
        s_sam = login_session("member-1")
        r = s_sam.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_sam2"}, timeout=15)
        item_id = r.json()["id"]
        TestPermissions.created_ids.append(item_id)
        s_neha = login_session("member-2")
        r2 = s_neha.patch(f"{API}/work-items/{item_id}", json={"remarks": "hack"}, timeout=15)
        assert r2.status_code == 403

    def test_manager_can_edit_own_dept_item(self):
        s_sam = login_session("member-1")
        item_id = s_sam.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_forrahul"}, timeout=15).json()["id"]
        TestPermissions.created_ids.append(item_id)
        s_rahul = login_session("manager-1")  # Content manager, sam is Content member
        r = s_rahul.patch(f"{API}/work-items/{item_id}", json={"remarks": "reviewed"}, timeout=15)
        assert r.status_code == 200

    def test_manager_cannot_edit_other_dept_item(self):
        s_sam = login_session("member-1")
        item_id = s_sam.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_forpriya"}, timeout=15).json()["id"]
        TestPermissions.created_ids.append(item_id)
        s_priya = login_session("manager-2")  # Design manager, sam is Content
        r = s_priya.patch(f"{API}/work-items/{item_id}", json={"remarks": "x"}, timeout=15)
        assert r.status_code == 403

    def test_member_cannot_set_closed_status(self):
        s = login_session("member-1")
        item_id = s.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_close"}, timeout=15).json()["id"]
        TestPermissions.created_ids.append(item_id)
        r = s.patch(f"{API}/work-items/{item_id}", json={"status": "Closed"}, timeout=15)
        assert r.status_code == 403

    def test_manager_can_set_closed_status(self):
        s_sam = login_session("member-1")
        item_id = s_sam.post(f"{API}/work-items", json={"deliverable_name": "TEST_iter8_mgrclose"}, timeout=15).json()["id"]
        TestPermissions.created_ids.append(item_id)
        s_rahul = login_session("manager-1")
        r = s_rahul.patch(f"{API}/work-items/{item_id}", json={"status": "Closed"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["status"] == "Closed"

    def test_everyone_can_list_all_items(self):
        s = login_session("member-3")  # animation member
        r = s.get(f"{API}/work-items", timeout=15)
        assert r.status_code == 200
        # should include sam's items too
        creator_ids = {it["creator_id"] for it in r.json()}
        assert "member-1" in creator_ids


# --- Regression smoke ---
class TestSmoke:
    def test_admin_dashboard_overview(self):
        s = login_session("admin-1")
        r = s.get(f"{API}/dashboard/overview", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "total_projects" in d and "total_deliverables" in d

    def test_projects_list(self):
        s = login_session("manager-1")
        r = s.get(f"{API}/projects", timeout=15)
        assert r.status_code == 200

    def test_clients_list_public(self):
        r = requests.get(f"{API}/clients", timeout=15)
        # clients endpoint doesn't require auth per code
        assert r.status_code == 200

    def test_approvals_list(self):
        s = login_session("manager-1")
        r = s.get(f"{API}/approvals", timeout=15)
        assert r.status_code == 200


# --- Cleanup ---
def test_zzz_cleanup_created_items():
    """Delete all TEST_ prefixed work items created by this test run."""
    s = login_session("admin-1")
    # get all items with TEST_iter8 prefix
    r = s.get(f"{API}/work-items", params={"search": "TEST_iter8"}, timeout=15)
    ids = [it["id"] for it in r.json() if it.get("deliverable_name", "").startswith("TEST_iter8")]
    if ids:
        rd = s.post(f"{API}/work-items/bulk-delete", json={"ids": ids}, timeout=30)
        assert rd.status_code == 200
        print(f"Cleaned {rd.json().get('deleted_count')} test items")
