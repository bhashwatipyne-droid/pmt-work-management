import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from home_monthly import monthly_overview, months_back

TODAY = date(2026, 9, 15)


def fact(start, due, finished=False, completed_on=None):
    return {"start": start, "due": due, "finished": finished, "completed_on": completed_on}


def by_month(rows):
    return {r["month"]: r for r in rows}


def test_twelve_months_ending_at_the_month():
    assert months_back("2026-02", 3) == ["2025-12", "2026-01", "2026-02"]
    rows = monthly_overview([], "2026-09", TODAY)
    assert len(rows) == 12 and rows[0]["month"] == "2025-10" and rows[-1]["month"] == "2026-09"


def test_current_month_splits_delayed_due_soon_on_track():
    facts = [
        fact("2026-09-01", "2026-09-10"),  # overdue
        fact("2026-09-01", "2026-09-20"),  # due within 7 days of today
        fact("2026-09-01", "2026-09-29"),  # on track
        fact("2026-09-01", "2026-09-05", finished=True, completed_on="2026-09-04"),  # done
    ]
    sep = by_month(monthly_overview(facts, "2026-09", TODAY))["2026-09"]
    assert (sep["active"], sep["delayed"], sep["due_soon"], sep["on_track"]) == (3, 1, 1, 1)


def test_past_month_counts_work_open_at_its_end():
    facts = [
        fact("2026-07-02", "2026-07-20", finished=True, completed_on="2026-08-10"),  # late in July, done in Aug
        fact("2026-07-02", "2026-07-25", finished=True, completed_on="2026-07-24"),  # done in July
    ]
    rows = by_month(monthly_overview(facts, "2026-09", TODAY))
    assert rows["2026-07"]["active"] == 1 and rows["2026-07"]["delayed"] == 1
    assert rows["2026-08"]["active"] == 0


def test_stale_open_backlog_and_undated_rows_are_left_out():
    facts = [fact("2025-01-01", "2025-02-01"), fact(None, None)]
    sep = by_month(monthly_overview(facts, "2026-09", TODAY))["2026-09"]
    assert sep["active"] == 0


def test_finished_without_completion_date_closes_on_its_due_day():
    facts = [fact("2026-06-01", "2026-07-10", finished=True)]
    rows = by_month(monthly_overview(facts, "2026-09", TODAY))
    assert rows["2026-06"]["active"] == 1 and rows["2026-07"]["active"] == 0
