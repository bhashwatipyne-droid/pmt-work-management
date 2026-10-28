import os, sys
from datetime import datetime, timezone
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import planning


def test_deleted_row_counts_as_done():
    statuses = planning.resolve_work_status(["a", "b"], {"a": "Ongoing"})
    assert statuses == {"a": "Ongoing", "b": "Closed"}


def test_task_with_deleted_row_is_not_rolled_forward():
    now = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
    task = {"id": "t", "status": "accepted", "work_item_id": "gone", "work_date": "2026-10-26",
            "assignee_pmt_name": "Krishna", "deliverable_name": "x", "created_at": "2026-10-26T04:51:12.760Z", "seq": 1}
    status = planning.resolve_work_status(["gone"], {})
    rows = planning.build_plan_rows([task], status, now)
    assert rows[0]["status"] == "done"
    assert rows[0]["cat"] != "rolled"
    # the same task with a still-open row is rolled forward as before
    open_rows = planning.build_plan_rows([task], {"gone": "Not Started"}, now)
    assert open_rows[0]["cat"] == "rolled"
