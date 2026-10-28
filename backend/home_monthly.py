"""Month-by-month overview for the Home page chart ("At a glance - last 12 months").

Each bar is exactly what Home shows when you pick that month: the same month
scope and the same buckets as build_dashboard_home(), so the number on a bar is
the "N deliverables" in that month's header; the split below is that month's
on track / delayed / at risk counts.

Per deliverable the caller passes:
    start, due     ISO days (either may be missing); due is the current stage's deadline
    finished       done, or inside a billed / completed project
    ready          its project is "Ready for Invoice"
    in_review      its stage is "Ready for Review" (so it is not "at risk")

For a month:
    scope     started in the month, plus still-open work that started earlier
              (open work overdue by more than stale_days before the month is
              backlog and left out)
    total     scope: what Home shows as "N deliverables" for that month (the bar height)
    active    scope, minus finished and ready-to-invoice work
    delayed   active and past due (due before today)
    at risk   active, not delayed, due within at_risk_days of today, not in review
    on track  the rest of active

"Today" is the same for every month, as on the page, so an older month shows
what is still open and late today, not a snapshot of how it looked then.
"""
from datetime import date, timedelta
from typing import Dict, List, Optional


def _bounds(month: str):
    year, mon = int(month[:4]), int(month[5:7])
    start = date(year, mon, 1)
    nxt = date(year + (mon == 12), 1 if mon == 12 else mon + 1, 1)
    return start, nxt - timedelta(days=1)


def months_back(month: str, count: int) -> List[str]:
    year, mon = int(month[:4]), int(month[5:7])
    out = []
    for _ in range(count):
        out.append(f"{year:04d}-{mon:02d}")
        mon -= 1
        if mon == 0:
            mon, year = 12, year - 1
    return list(reversed(out))


def monthly_overview(
    facts: List[Dict[str, Optional[object]]],
    month: str,
    today: date,
    count: int = 12,
    at_risk_days: int = 2,
    stale_days: int = 90,
) -> List[dict]:
    today_s = today.isoformat()
    risk_until = (today + timedelta(days=at_risk_days)).isoformat()
    out = []
    for m in months_back(month, count):
        m_start, m_end = _bounds(m)
        start_s, end_s = m_start.isoformat(), m_end.isoformat()
        stale_before = (m_start - timedelta(days=stale_days)).isoformat()

        total = active = delayed = at_risk = 0
        for f in facts:
            start, due = f.get("start"), f.get("due")
            finished = bool(f.get("finished"))
            is_new = bool(start) and start_s <= start <= end_s
            in_month = bool(due) and start_s <= due <= end_s
            started_before = (start or due or "") < start_s and not is_new
            stale = not finished and bool(due) and due < stale_before and not is_new and not in_month
            spilled_in = started_before and not stale and bool(start or due) and not finished
            if not (is_new or spilled_in):
                continue
            total += 1
            if finished or f.get("ready"):
                continue
            active += 1
            if due and due < today_s:
                delayed += 1
            elif due and due <= risk_until and not f.get("in_review"):
                at_risk += 1
        out.append({
            "month": m,
            "total": total,
            "active": active,
            "delayed": delayed,
            "at_risk": at_risk,
            "on_track": active - delayed - at_risk,
        })
    return out
