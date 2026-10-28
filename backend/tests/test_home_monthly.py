import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from home_monthly import monthly_overview, months_back  # noqa: E402

TODAY = date(2026, 10, 15)


def fact(start, due, finished=False, ready=False, in_review=False):
    return {"start": start, "due": due, "finished": finished, "ready": ready, "in_review": in_review}


def by_month(rows):
    return {r["month"]: r for r in rows}


def test_twelve_months_ending_at_the_month():
    assert months_back("2026-02", 3) == ["2025-12", "2026-01", "2026-02"]
    rows = monthly_overview([], "2026-10", TODAY)
    assert len(rows) == 12 and rows[0]["month"] == "2025-11" and rows[-1]["month"] == "2026-10"


def test_a_month_counts_what_started_in_it_plus_open_spill_in():
    facts = [
        fact("2026-10-02", "2026-10-30"),   # new, on track
        fact("2026-10-02", "2026-10-10"),   # new, already late
        fact("2026-10-02", "2026-10-16"),   # new, due within 2 days -> at risk
        fact("2026-09-20", "2026-10-25"),   # started earlier, still open: spilled in
        fact("2026-10-03", "2026-10-09", finished=True),  # finished: not active
        fact("2026-10-03", "2026-10-30", ready=True),     # ready to invoice: not active
    ]
    row = by_month(monthly_overview(facts, "2026-10", TODAY))["2026-10"]
    assert (row["active"], row["delayed"], row["at_risk"], row["on_track"]) == (4, 1, 1, 2)
    assert row["total"] == 6  # the header's "N deliverables": active plus finished and ready


def test_work_in_review_is_not_at_risk():
    row = by_month(monthly_overview([fact("2026-10-02", "2026-10-16", in_review=True)], "2026-10", TODAY))["2026-10"]
    assert (row["active"], row["at_risk"], row["on_track"]) == (1, 0, 1)


def test_old_open_work_is_backlog_not_every_month():
    # started and due in January, never closed: January's work, not March's or October's
    rows = by_month(monthly_overview([fact("2026-01-05", "2026-01-20")], "2026-10", TODAY))
    assert rows["2026-01"]["active"] == 1
    assert rows["2026-02"]["active"] == 1       # still inside the 90-day spill window
    assert rows["2026-06"]["active"] == 0
    assert rows["2026-10"]["active"] == 0


def test_undated_rows_are_left_out_and_dateless_due_counts_on_track():
    rows = by_month(monthly_overview([fact(None, None), fact("2026-10-01", None)], "2026-10", TODAY))
    assert rows["2026-10"]["active"] == 1 and rows["2026-10"]["on_track"] == 1
