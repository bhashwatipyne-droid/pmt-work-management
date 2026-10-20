"""Pipeline-stage helpers: which stages a deliverable goes through, what comes
next, how a stage's date window is written, and the dates derived from it.

Moved out of server.py unchanged (pure functions, no database).
"""
from datetime import datetime  # noqa: F401
from typing import Dict, List, Optional

from fastapi import HTTPException

try:
    from domain_constants import STAGES
    from work_items_rules import validate_work_date
except ImportError:  # run as backend.server from the repo root
    from backend.domain_constants import STAGES
    from backend.work_items_rules import validate_work_date


def normalize_stages(stages: Optional[List[str]]) -> List[str]:
    """
    Return selected production stages in the canonical production order.
    """
    if not stages:
        raise HTTPException(
            status_code=400,
            detail="At least one production stage is required",
        )

    selected = set()

    for stage in stages:
        if stage not in STAGES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid production stage: {stage}",
            )
        selected.add(stage)

    return [stage for stage in STAGES if stage in selected]


def stored_stages(raw) -> List[str]:
    """normalize_stages() for data already in the database. A legacy or
    hand-edited deliverable with missing/invalid stages yields [] here instead
    of raising an HTTP 400, which would otherwise abort a notification scan
    (and fail whichever user's request happened to trigger it)."""
    try:
        return normalize_stages(raw or [])
    except HTTPException:
        return []


def next_selected_stage(
    current_stage: str,
    required_stages: List[str],
) -> Optional[str]:
    """
    Find the next stage from this deliverable's configured pipeline.
    """
    stages = normalize_stages(required_stages)

    try:
        index = stages.index(current_stage)
    except ValueError:
        return None

    if index + 1 >= len(stages):
        return None

    return stages[index + 1]
def reconcile_stage_after_edit(
    current_stage: Optional[str],
    stage_status: Optional[str],
    stages: List[str],
) -> Optional[dict]:
    """Decide where a deliverable should sit after its production stages
    were edited. Returns the fields to change, or None if it is fine as is.

    `stages` is the new, normalized pipeline. Editing the pipeline used to
    only rewrite `required_stages`, leaving `current_stage` / `stage_status`
    untouched, so a deliverable could end up pointing at a stage that is no
    longer in its pipeline (e.g. pipeline changed to Design while the
    deliverable still said "Content - Completed"). No team's board matched it
    and nobody was ever asked to approve or work on it.

    - Current stage still in the pipeline and not finished: leave it alone.
    - Current stage finished and a later stage now exists (a stage was
      added): hand it to that stage, with its approval open.
    - Current stage removed and a later stage exists: hand it to the next
      stage in the pipeline, with its approval open.
    - Current stage removed and nothing later remains: every remaining stage
      is already behind it, so the deliverable is complete.
    """
    order = {stage: index for index, stage in enumerate(STAGES)}
    current_index = order.get(current_stage, -1)

    if current_stage in stages:
        if stage_status != "Completed":
            return None
        later = [stage for stage in stages if order[stage] > current_index]
        if later:
            return {"current_stage": later[0], "stage_status": "Ready for Review"}
        return None

    later = [stage for stage in stages if order[stage] > current_index]
    if later:
        return {"current_stage": later[0], "stage_status": "Ready for Review"}
    return {"current_stage": stages[-1], "stage_status": "Completed"}


def _format_date_short(value: Optional[str]) -> str:
    """"2026-09-24" -> "24 Sep". Falls back to the raw value if it isn't a
    plain YYYY-MM-DD date, so a bad stored value never breaks a message."""
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b")
    except (TypeError, ValueError):
        return value or ""


def format_stage_window(window: Optional[dict]) -> str:
    """{"start_dt": "2026-09-22", "end_dt": "2026-09-24"} -> "22 Sep - 24 Sep".
    An end date with no start (a deadline only) -> "due 24 Sep". Empty string
    when there is no window to show at all."""
    if not window or not window.get("end_dt"):
        return ""
    if not window.get("start_dt"):
        return f'due {_format_date_short(window["end_dt"])}'
    return f'{_format_date_short(window["start_dt"])} - {_format_date_short(window["end_dt"])}'


def normalize_stage_schedule(
    required_stages: List[str],
    stage_schedule: Optional[dict],
) -> Dict[str, Dict[str, Optional[str]]]:
    """Clean a stage_schedule payload down to one validated entry per stage
    that has at least an end date (a deadline). Raises HTTPException(400) on
    a bad date, an inverted range, or a start with no end.

    A stage's end date alone is a normal, common case - "due the 24th" with no
    fixed start, e.g. because it starts whenever the previous stage finishes.
    A start with no end isn't very useful for tracking a deadline, so that
    combination is rejected rather than silently accepted. A stage not in
    `required_stages` is silently dropped (e.g. the stage was deselected in
    the same edit). A stage with no dates at all simply has no entry:
    deadline tracking is opt-in per stage, not mandatory."""
    cleaned: Dict[str, Dict[str, Optional[str]]] = {}
    for stage, window in (stage_schedule or {}).items():
        if stage not in required_stages:
            continue
        start = (window or {}).get("start_dt") or None
        end = (window or {}).get("end_dt") or None
        if not start and not end:
            continue
        if start and not end:
            raise HTTPException(
                status_code=400,
                detail=f"The {stage} stage has a start date but no end date (deadline) - add one, or remove the start date.",
            )
        for value in (v for v in (start, end) if v):
            try:
                validate_work_date(value)
            except HTTPException:
                raise HTTPException(
                    status_code=400,
                    detail=f"The {stage} stage's dates must be valid (got \"{value}\").",
                )
        if start and end and end < start:
            raise HTTPException(
                status_code=400,
                detail=f"The {stage} stage's end date must be on or after its start date.",
            )
        cleaned[stage] = {"start_dt": start, "end_dt": end}
    return cleaned


def derive_deliverable_dates(
    required_stages: List[str],
    stage_schedule: dict,
) -> tuple:
    """The deliverable's overall start/end, derived as the earliest stage
    start and latest stage end among its own required_stages. A stage with
    only an end date (a deadline, no fixed start) contributes to the overall
    end but not the overall start. (None, None) when no stage has a tracked
    window at all."""
    starts = [
        stage_schedule[s]["start_dt"]
        for s in required_stages
        if s in stage_schedule and stage_schedule[s].get("start_dt")
    ]
    ends = [
        stage_schedule[s]["end_dt"]
        for s in required_stages
        if s in stage_schedule and stage_schedule[s].get("end_dt")
    ]
    return (min(starts) if starts else None, max(ends) if ends else None)
