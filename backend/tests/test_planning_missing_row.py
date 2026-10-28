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


def _sheet_row(status):
    row = {"id": "w1", "creator_id": "u1", "work_date": "2026-10-26", "status": status,
           "deliverable_name": "Carousel", "created_at": "2026-10-26T05:00:00+00:00", "time_taken_minutes": 120}
    items, statuses = planning.sheet_rows_as_items([row], {"u1": "Krishna"}, {}, {})
    return items, statuses


def test_manual_row_follows_the_same_rollover_rule_as_a_whatsapp_task():
    now = datetime(2026, 10, 28, 9, 0, tzinfo=timezone.utc)
    items, statuses = _sheet_row("Not Started")
    open_row = planning.build_plan_rows(items, statuses, now)[0]
    assert open_row["cat"] == "rolled" and open_row["status"] == "todo"
    assert open_row["d0"] == 0 and open_row["d1"] == 2  # Mon..Wed

    items, statuses = _sheet_row("Closed")
    closed = planning.build_plan_rows(items, statuses, now)[0]
    assert closed["status"] == "done" and closed["cat"] != "rolled"
    assert closed["d0"] == closed["d1"] == 0
