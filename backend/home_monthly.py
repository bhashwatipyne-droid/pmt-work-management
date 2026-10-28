"""Month-by-month overview for the Home page chart ("At a glance - last 12 months").

Each deliverable is reduced to four facts by build_dashboard_home():
    start, due           ISO days (either may be missing)
    finished             done, or inside a billed / completed project
    completed_on         ISO day it was finished (the deliverable's last update;
                         the app stores no separate completed-at), or None

For every month the chart shows the work that was ACTIVE at the end of it:
    active      started on or before the month end, and not finished by then
                (open work that has been overdue for more than stale_days is
                backlog and left out, like the month scope on the page)
    delayed     active and past its due date
                (current month: due before today; past months: due by month end)
    due soon    active, not delayed, due within `next_days` of the reference day
                (current month: today; past months: the month end)
    on track    everything else that is active

History is rebuilt from today's data, so an older month is an estimate: a
deliverable that was re-dated or finished later is shown as it stands now.
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
    next_days: int = 7,
    stale_days: int = 90,
) -> List[dict]:
    this_month = today.strftime("%Y-%m")
    out = []
    for m in months_back(month, count):
        m_start, m_end = _bounds(m)
        end_s, start_s = m_end.isoformat(), m_start.isoformat()
        current = m == this_month
        ref = today if current else m_end
        soon_until = (ref + timedelta(days=next_days)).isoformat()
        stale_before = (m_start - timedelta(days=stale_days)).isoformat()

        active = delayed = soon = 0
        for f in facts:
            start, due = f.get("start"), f.get("due")
            began = start or due
            if not began or began > end_s:
                continue
            finished, done_on = bool(f.get("finished")), f.get("completed_on")
            if finished:
                # no completion date (billed project): treat it as closed on its due day
                closed = done_on or due or began
                if closed <= end_s:
                    continue
                if current:  # finished now, so not open this month
                    continue
            elif due and due < stale_before:
                continue
            active += 1
            late = bool(due) and (due < today.isoformat() if current else due <= end_s)
            if late:
                delayed += 1
            elif due and due <= soon_until:
                soon += 1
        out.append({
            "month": m,
            "active": active,
            "delayed": delayed,
            "due_soon": soon,
            "on_track": active - delayed - soon,
        })
    return out
