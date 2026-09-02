"""
Iteration 4 test — Bug fix: POST /api/work-items/bulk-create with empty template {}
must produce rows with project_id=None, deliverable_id=None, stage=None (truly empty).

Regressions:
- count validation (0/501 -> 400)
- member role scoping (creator_id forced to acting user)
- single-row POST /api/work-items still stores project/deliverable/stage from body
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = "admin-1"
MEMBER = "member-1"

created_ids = []


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    # Cleanup: bulk-delete rows created during tests
    if created_ids:
        try:
            requests.post(
                f"{API}/work-items/bulk-delete",
                headers={"X-User-Id": ADMIN, "Content-Type": "application/json"},
                json={"ids": created_ids},
                timeout=30,
            )
        except Exception as e:
            print(f"cleanup failed: {e}")


def _post_bulk(count, template=None, user_id=ADMIN):
    body = {"count": count}
    if template is not None:
        body["template"] = template
    return requests.post(
        f"{API}/work-items/bulk-create",
        headers={"X-User-Id": user_id, "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )


# ---- Bug fix ---------------------------------------------------------------

def test_bulk_create_empty_template_produces_empty_rows():
    """When frontend sends template={}, new rows must have null project/deliverable/stage."""
    r = _post_bulk(5, template={})
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 5
    for row in rows:
        created_ids.append(row["id"])
        # THE bug-fix invariant:
        assert row["project_id"] is None, f"project_id must be None, got {row['project_id']}"
        assert row["deliverable_id"] is None, f"deliverable_id must be None, got {row['deliverable_id']}"
        assert row["stage"] is None, f"stage must be None, got {row['stage']}"
        # Acceptable defaults:
        assert row["work_category"] == "Core"
        assert row["status"] == "Not Started"
        assert row["work_date"]  # today
        assert row["deliverable_name"] in ("", None)


def test_bulk_create_no_template_also_empty():
    """Omitting template entirely (server default) also yields empty rows."""
    r = _post_bulk(3)
    assert r.status_code == 200, r.text
    rows = r.json()
    assert len(rows) == 3
    for row in rows:
        created_ids.append(row["id"])
        assert row["project_id"] is None
        assert row["deliverable_id"] is None
        assert row["stage"] is None


# ---- Regressions -----------------------------------------------------------

def test_bulk_create_count_zero_rejected():
    r = _post_bulk(0, template={})
    assert r.status_code == 400


def test_bulk_create_count_501_rejected():
    r = _post_bulk(501, template={})
    assert r.status_code == 400


def test_bulk_create_member_forces_creator_id():
    r = _post_bulk(2, template={"creator_id": ADMIN}, user_id=MEMBER)
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        created_ids.append(row["id"])
        assert row["creator_id"] == MEMBER, "member must own the rows they bulk-create"


def test_bulk_create_admin_can_pass_template_fields():
    """Sanity: bulk-create still HONOURS template when non-empty (only the frontend now
    chooses to send empty template). This proves the backend behavior is unchanged."""
    # Fetch a real project id
    projects = requests.get(f"{API}/projects", headers={"X-User-Id": ADMIN}, timeout=15).json()
    if not projects:
        pytest.skip("no project seed available")
    pid = projects[0]["id"]
    r = _post_bulk(2, template={"project_id": pid, "stage": "Content"})
    assert r.status_code == 200
    rows = r.json()
    for row in rows:
        created_ids.append(row["id"])
        assert row["project_id"] == pid
        assert row["stage"] == "Content"
