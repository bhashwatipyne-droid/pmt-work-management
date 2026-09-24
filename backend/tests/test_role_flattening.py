"""
Backend tests for the flattened role gating:

- Projects: readable by every role; every write is admin-only.
- Approvals: readable by every role (admins/members see the full board,
  read-only); approve / send back / move / hide are manager-only.
- Efficiency: readable by every role; monthly capacity writes are manager-only.

Same live-server style as the other suites (needs REACT_APP_BACKEND_URL).
"""
import os

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin-1"
MGR = "manager-1"
MEMBER = "member-1"


def H(uid):
    return {"X-User-Id": uid, "Content-Type": "application/json"}


# ---------------- Projects ----------------
class TestProjectsReadEveryoneWriteAdmin:
    @pytest.mark.parametrize("uid", [ADMIN, MGR, MEMBER])
    def test_everyone_can_list_projects(self, uid):
        r = requests.get(f"{API}/projects", headers=H(uid))
        assert r.status_code == 200

    @pytest.mark.parametrize("uid", [MGR, MEMBER])
    def test_non_admin_cannot_see_hidden_projects(self, uid):
        r = requests.get(f"{API}/projects", params={"visibility": "hidden"}, headers=H(uid))
        assert r.status_code == 200
        assert all(not p.get("hidden") for p in r.json())

    @pytest.mark.parametrize("uid", [ADMIN, MGR, MEMBER])
    def test_everyone_can_open_project_detail(self, uid):
        projects = requests.get(f"{API}/projects", headers=H(ADMIN)).json()
        if not projects:
            pytest.skip("no projects to open")
        r = requests.get(f"{API}/projects/{projects[0]['id']}", headers=H(uid))
        assert r.status_code == 200

    @pytest.mark.parametrize("uid", [MGR, MEMBER])
    def test_non_admin_project_writes_blocked(self, uid):
        for method, path, body in [
            ("post", "/projects", {"name": "x"}),
            ("post", "/projects/bulk-hide", {"project_ids": ["nope"]}),
            ("post", "/projects/bulk-unhide", {"project_ids": ["nope"]}),
            ("post", "/projects/bulk-delete", {"project_ids": ["nope"]}),
            ("post", "/projects/nope/hide", None),
            ("post", "/projects/nope/unhide", None),
            ("delete", "/projects/nope", None),
            ("delete", "/deliverables/nope", None),
        ]:
            r = requests.request(method, f"{API}{path}", json=body, headers=H(uid))
            assert r.status_code == 403, (path, r.status_code, r.text)

    def test_search_with_regex_characters_does_not_500(self):
        r = requests.get(f"{API}/work-items", params={"search": "(", "limit": 5}, headers=H(MEMBER))
        assert r.status_code == 200


# ---------------- Approvals ----------------
class TestApprovalsViewEveryoneActManager:
    @pytest.mark.parametrize("uid", [ADMIN, MGR, MEMBER])
    def test_everyone_can_load_board_and_count(self, uid):
        assert requests.get(f"{API}/approvals/board", headers=H(uid)).status_code == 200
        assert requests.get(f"{API}/approvals/pending-count", headers=H(uid)).status_code == 200

    def test_admin_and_member_see_the_same_board(self):
        def total(uid):
            board = requests.get(f"{API}/approvals/board", headers=H(uid)).json()
            return sum(len(v) for v in board.values())

        assert total(ADMIN) == total(MEMBER)

    @pytest.mark.parametrize("uid", [ADMIN, MEMBER])
    def test_non_managers_cannot_act(self, uid):
        for method, path, body in [
            ("post", "/approval-items/nope/approve", {"note": ""}),
            ("post", "/approval-items/nope/send-back", {"note": "x"}),
            ("patch", "/approval-items/nope/move", {"approval_type": "LEADERSHIP"}),
            ("post", "/approval-items/nope/hide", None),
            ("post", "/approval-items/bulk-hide", {"approval_item_ids": ["nope"]}),
            ("post", "/deliverables/nope/approve", {"note": ""}),
            ("post", "/deliverables/nope/reject", {"note": ""}),
        ]:
            r = requests.request(method, f"{API}{path}", json=body, headers=H(uid))
            assert r.status_code == 403, (path, r.status_code, r.text)

    def test_manager_passes_the_role_check(self):
        # Unknown item: the manager gets past the role gate and hits 404.
        r = requests.post(f"{API}/approval-items/nope/approve", json={"note": ""}, headers=H(MGR))
        assert r.status_code == 404


# ---------------- Efficiency ----------------
class TestEfficiencyViewEveryoneEditManager:
    @pytest.mark.parametrize("uid", [ADMIN, MGR, MEMBER])
    def test_everyone_can_read_overview(self, uid):
        r = requests.get(f"{API}/efficiency/overview", params={"month": "2026-09"}, headers=H(uid))
        assert r.status_code == 200

    @pytest.mark.parametrize("uid", [ADMIN, MEMBER])
    def test_capacity_writes_blocked_for_non_managers(self, uid):
        body = {"user_id": MEMBER, "month": "2026-09", "working_days": 22, "leave_days": 0}
        assert requests.post(f"{API}/efficiency/monthly-capacity", json=body, headers=H(uid)).status_code == 403
        assert requests.put(f"{API}/efficiency/monthly-capacity/nope", json=body, headers=H(uid)).status_code == 403
        assert requests.delete(f"{API}/efficiency/monthly-capacity/nope", headers=H(uid)).status_code == 403
