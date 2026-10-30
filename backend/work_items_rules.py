"""Work Sheet row rules: validation, derived fields and role-based edit limits.

Moved out of server.py unchanged. Nothing here knows about HTTP routes; the
functions take plain dicts (and the acting user) and raise HTTPException for a
rule violation, exactly as they did inside server.py.
"""
import math
from contextvars import ContextVar
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from fastapi import HTTPException

try:
    from db_client import db
    from domain_constants import (
        DELIVERABLE_TYPE_CATEGORIES,
        DEPARTMENT_TO_STAGE,
        DONE_STATUSES,
        MEMBER_EDITABLE_FIELDS,
        STAGES,
    )
except ImportError:  # imported as backend.work_items_rules (uvicorn backend.server:app)
    from backend.db_client import db
    from backend.domain_constants import (
        DELIVERABLE_TYPE_CATEGORIES,
        DEPARTMENT_TO_STAGE,
        DONE_STATUSES,
        MEMBER_EDITABLE_FIELDS,
        STAGES,
    )

if TYPE_CHECKING:  # annotation only; avoids importing server.py from here
    from server import User


def validate_work_category_rules(merged: dict):
    """
    Efficiency rules for work items.

    Core     -> only counts toward productivity when status == "Closed"
                (enforced at read time in the efficiency module).
    Non-Core -> time_taken_minutes is mandatory and must be > 0 before the row
                can be closed. Blank draft rows stay editable.
    """
    category = merged.get("work_category")
    if not category:
        category = DELIVERABLE_TYPE_CATEGORIES.get(merged.get("deliverable_type") or "")

    if category == "Non-Core" and merged.get("status") in DONE_STATUSES:
        minutes = merged.get("time_taken_minutes") or 0
        if float(minutes) <= 0:
            raise HTTPException(
                status_code=400,
                detail="Non-core work needs time taken (in minutes) before it can be closed",
            )


# ---------------- Time taken: mandatory, auto-filled, always safe ----------------
#
# Time (minutes) on a work row feeds the efficiency formula: Non-Core minutes are
# subtracted from the month's working hours to get Core hours, and Core hours drive
# every activity's potential. So the value has to be a sane number, always.
#
#   * Every row that leaves "Not Started" must carry time > 0.
#   * When a deliverable type is chosen, time is filled from the worker's own
#     benchmark for that activity (their efficiency target) - no typing needed.
#   * It stays editable for edge cases. An edited value is remembered as "manual" so
#     picking another type later does not silently overwrite it.
#   * Whatever is typed must be a finite number, never negative, never more than 24 h
#     for one row - so a typo (or NaN) can never poison a month's totals.
MAX_WORK_ITEM_MINUTES = 1440.0
TIME_GATED_STATUSES = {"Ongoing", "Ready for Review"}
TIME_REQUIRED_MESSAGE = (
    "Please enter the time taken (in minutes) before moving this row forward."
)

# Guardrail against implausibly LOW manual times: logging 30 minutes against a
# deliverable whose benchmark is 500 almost always means the work was a small
# revision, which belongs under "Changes". A time typed by a person (never one
# filled from the benchmark) below this share of their benchmark is refused.
# Keep in step with LOW_TIME_RATIO / LOW_TIME_EXEMPT_TYPES in
# frontend/src/lib/timeRules.js.
LOW_TIME_RATIO = 0.25
# Types where short times are legitimate (and "Changes" is where people are
# sent to log small fixes).
LOW_TIME_EXEMPT_TYPES = {
    "Changes",
    "Other Initiatives",
    "Client Meets & Discussions",
    "Team Reviews and Feedback",
}


def _minutes_label(value: float) -> str:
    return str(int(value)) if float(value).is_integer() else f"{value:g}"


def _valid_minutes(value) -> Optional[float]:
    """A finite float, or None for anything that is not a usable number."""
    if value is None or isinstance(value, bool):
        return None
    try:
        minutes = float(value)
    except (TypeError, ValueError):
        return None
    return minutes if math.isfinite(minutes) else None


# ---------------- Quantity: one row, N units ----------------
#
# A Design or Animate row can cover several units (a 23-slide deck is one row
# with quantity 23, not 23 rows). The row's time is the total for all of them,
# and the per-unit minutes can be logged in a breakdown (quantity_items) -
# when any are logged, the row's time is their total, and a unit with nothing
# typed counts as the worker's own benchmark for the type (see apply_time_rules).
QUANTITY_STAGES = {"Design", "Animate"}
MAX_QUANTITY = 200

# Campaign ideation is done in bulk: one "Campaign Ideation Plan (...)" row on
# the Content sheet can cover several deliverables of one project at once. Such
# a row works like a Design/Animate row with a quantity, except that the
# quantity is not typed - it is the number of deliverables ticked in the
# Deliverable cell, and each unit is one of those deliverables
# (quantity_items[i] is the time for deliverable_ids[i]).
MULTI_DELIVERABLE_STAGE = "Content"
MULTI_DELIVERABLE_TYPE_PREFIX = "Campaign Ideation Plan"
# Data research is done the same way: one "Data Research and Analysis (SMI)" or
# "(Web)" row can cover several deliverables of its project.
MULTI_DELIVERABLE_TYPE_PREFIXES = (MULTI_DELIVERABLE_TYPE_PREFIX, "Data Research and Analysis")


def is_multi_deliverable_row(row: dict) -> bool:
    """True for a Content row whose type lets it cover several deliverables."""
    return row.get("stage") == MULTI_DELIVERABLE_STAGE and str(
        row.get("deliverable_type") or ""
    ).startswith(MULTI_DELIVERABLE_TYPE_PREFIXES)


def _clean_ids(raw) -> list:
    """The ids in order, without blanks or repeats."""
    seen = set()
    cleaned = []
    for value in raw or []:
        if value and value not in seen:
            seen.add(value)
            cleaned.append(value)
    return cleaned


def is_content_quantity_row(row: dict) -> bool:
    """True for a Content row on a Core deliverable type (Carousel, Minimalist,
    Presentation (PPT) - Per Slide ...) - it gets a typed Qty with time per
    unit, the same as a Design row. Non-Core activities (meetings, hiring...)
    never do, and Campaign Ideation Plan rows keep their own rule (their
    quantity is the number of ticked deliverables)."""
    if row.get("stage") != MULTI_DELIVERABLE_STAGE or is_multi_deliverable_row(row):
        return False
    deliverable_type = row.get("deliverable_type") or ""
    if not deliverable_type:
        return False
    category = DELIVERABLE_TYPE_CATEGORIES.get(deliverable_type) or row.get("work_category")
    return category == "Core"


def quantity_applies(row: dict) -> bool:
    """Whether a row can carry a quantity (and per-unit times) at all."""
    return (
        row.get("stage") in QUANTITY_STAGES
        or is_multi_deliverable_row(row)
        or is_content_quantity_row(row)
    )


def units_of(row: dict) -> int:
    """How many units a row covers for time purposes: its quantity on a
    Design/Animate row, a multi-deliverable Content row or a Core Content row,
    1 everywhere else."""
    if not quantity_applies(row):
        return 1
    try:
        return max(1, min(int(float(row.get("quantity") or 1)), MAX_QUANTITY))
    except (TypeError, ValueError):
        return 1


MAX_VIDEO_DURATION_SECONDS = int(MAX_WORK_ITEM_MINUTES * 60)  # 24 hours


def normalize_video_duration(update_fields: dict) -> None:
    """Video length is stored in SECONDS (video_duration_seconds, whole number)
    and mirrored into video_duration_minutes (seconds / 60) so anything still
    reading minutes keeps working. A request may send either field; seconds
    win when both are present. Mutates update_fields; raises HTTPException(400)
    for a value that is not a number between 0 seconds and 24 hours."""
    has_seconds = "video_duration_seconds" in update_fields
    has_minutes = "video_duration_minutes" in update_fields
    if not (has_seconds or has_minutes):
        return

    # A create payload carries every field, so "seconds is None" there only
    # means "not sent" - fall back to minutes from an older client.
    seconds = None
    raw = None
    factor = 1
    if update_fields.get("video_duration_seconds") is not None:
        raw = update_fields["video_duration_seconds"]
    elif update_fields.get("video_duration_minutes") is not None:
        raw = update_fields["video_duration_minutes"]
        factor = 60

    if raw is not None:
        value = _valid_minutes(raw)  # "a finite float or None", despite the name
        if value is None or value < 0 or value * factor > MAX_VIDEO_DURATION_SECONDS:
            raise HTTPException(
                status_code=400,
                detail="Duration must be between 0 seconds and 24 hours.",
            )
        seconds = int(round(value * factor))

    update_fields["video_duration_seconds"] = seconds
    update_fields["video_duration_minutes"] = None if seconds is None else round(seconds / 60, 2)


def _has_video_duration(row: dict) -> bool:
    return (
        row.get("video_duration_seconds") is not None
        or row.get("video_duration_minutes") is not None
    )


def _clear_video_duration(update_fields: dict) -> None:
    update_fields["video_duration_seconds"] = None
    update_fields["video_duration_minutes"] = None


def apply_deliverable_list_rules(existing: dict, update_fields: dict) -> None:
    """Keep deliverable_id, deliverable_ids, quantity and quantity_items in step
    on a multi-deliverable row (see is_multi_deliverable_row), and clear them
    when a row stops being one. The first deliverable is always the row's
    deliverable_id, the quantity is the number of deliverables, and each
    deliverable keeps its own time when the list changes. A deliverable belongs
    to one project, so moving the row to another project empties the list.
    Mutates update_fields; raises HTTPException(400) on a violation.
    `existing` is {} when creating."""
    if "deliverable_ids" in update_fields and update_fields["deliverable_ids"] is None:
        update_fields.pop("deliverable_ids")

    merged = {**existing, **update_fields}
    was_multi = is_multi_deliverable_row(existing)

    if not is_multi_deliverable_row(merged):
        if len(_clean_ids(update_fields.get("deliverable_ids"))) > 1:
            raise HTTPException(
                status_code=400,
                detail="Several deliverables can be ticked on Campaign Ideation Plan and Data Research and Analysis rows only.",
            )
        if was_multi:
            # Back to an ordinary row: the deliverable list and the time for
            # each deliverable mean nothing any more.
            update_fields.update({"deliverable_ids": [], "quantity": 1.0, "quantity_items": []})
        elif "deliverable_ids" in update_fields:
            update_fields["deliverable_ids"] = []
        return

    # A row saved before the list existed has just its deliverable_id.
    stored_ids = _clean_ids(existing.get("deliverable_ids"))
    if not stored_ids and existing.get("deliverable_id"):
        stored_ids = [existing["deliverable_id"]]

    project_changed = "project_id" in update_fields and update_fields["project_id"] != existing.get("project_id")

    if "deliverable_ids" in update_fields:
        ids = _clean_ids(update_fields["deliverable_ids"])
    elif "deliverable_id" in update_fields:
        # Set the old single-deliverable way (paste, fill down, clearing the
        # cell): the same first deliverable leaves the ticked list alone,
        # anything else replaces it.
        deliverable_id = update_fields["deliverable_id"]
        if deliverable_id and stored_ids and deliverable_id == stored_ids[0] and not project_changed:
            ids = stored_ids
        else:
            ids = [deliverable_id] if deliverable_id else []
    elif project_changed:
        ids = []
    else:
        ids = stored_ids

    if len(ids) > MAX_QUANTITY:
        raise HTTPException(
            status_code=400,
            detail=f"A row can cover up to {MAX_QUANTITY} deliverables.",
        )

    if (
        was_multi
        and ids == stored_ids
        and not project_changed
        and "deliverable_ids" not in update_fields
        and "deliverable_id" not in update_fields
    ):
        # Nothing about the deliverables is changing, so a quantity sent along
        # with some other edit has nothing to say.
        update_fields.pop("quantity", None)
        return

    update_fields["deliverable_ids"] = ids
    update_fields["deliverable_id"] = ids[0] if ids else None
    update_fields["quantity"] = float(max(1, len(ids)))

    if "quantity_items" not in update_fields:
        if not was_multi:
            # Just became a multi-deliverable row: nothing from before applies.
            update_fields["quantity_items"] = []
        elif ids != stored_ids:
            # Each deliverable keeps the time typed for it when others are
            # ticked or unticked; a newly ticked one starts empty.
            old = existing.get("quantity_items") or []
            by_deliverable = {did: old[i] for i, did in enumerate(stored_ids) if i < len(old)}
            update_fields["quantity_items"] = [by_deliverable.get(did) for did in ids]


async def validate_deliverable_ids(update_fields: dict, existing: Optional[dict] = None) -> None:
    """Check the deliverables ticked on a row: they must exist and belong to the
    row's project. Sets deliverable_id (the first one) from them and drops a
    "Not available" choice. Raises HTTPException(400) on a violation."""
    if update_fields.get("deliverable_ids") is None:
        return
    ids = _clean_ids(update_fields["deliverable_ids"])
    update_fields["deliverable_ids"] = ids
    update_fields["deliverable_id"] = ids[0] if ids else None
    if not ids:
        return
    if len(ids) > MAX_QUANTITY:
        raise HTTPException(
            status_code=400,
            detail=f"A row can cover up to {MAX_QUANTITY} deliverables.",
        )

    project_id = update_fields.get("project_id", (existing or {}).get("project_id"))
    if not project_id:
        raise HTTPException(status_code=400, detail="Select a project before ticking deliverables.")

    rows = await _cached_lookup(
        ("deliverables", tuple(ids)),
        lambda: db.deliverables.find(
            {"id": {"$in": ids}}, {"_id": 0, "id": 1, "project_id": 1}
        ).to_list(len(ids)),
    )
    if len({row["id"] for row in rows}) != len(ids):
        raise HTTPException(status_code=400, detail="Invalid deliverable")
    if any(row.get("project_id") != project_id for row in rows):
        raise HTTPException(
            status_code=400,
            detail="Deliverables ticked on one row must belong to the row's project.",
        )
    update_fields["deliverable_not_available"] = False


def apply_quantity_rules(existing: dict, update_fields: dict) -> None:
    """Validate quantity / quantity_items / video duration and keep
    them consistent with the stage and with each other. Mutates update_fields;
    raises HTTPException(400) on a violation. `existing` is {} when creating."""
    # Creating from a payload that leaves the optional fields out.
    if "quantity_items" in update_fields and update_fields["quantity_items"] is None:
        update_fields.pop("quantity_items")
    if "quantity" in update_fields and update_fields["quantity"] is None:
        update_fields["quantity"] = 1.0

    normalize_video_duration(update_fields)
    apply_deliverable_list_rules(existing, update_fields)

    merged = {**existing, **update_fields}
    stage = merged.get("stage")

    if not quantity_applies(merged):
        if (
            ("quantity" in update_fields and float(update_fields["quantity"]) != 1.0)
            or update_fields.get("quantity_items")
        ):
            raise HTTPException(
                status_code=400,
                detail="Quantity applies to Design, Animate and Content rows on Core deliverable types only.",
            )
        if update_fields.get("video_duration_seconds") is not None:
            raise HTTPException(status_code=400, detail="Duration applies to Animate rows only.")
        # Stage or type moved to something quantity doesn't cover (another stage,
        # or a Non-Core type on a Content row): the old quantity no longer means anything.
        if (
            "stage" in update_fields
            or "deliverable_type" in update_fields
            or "work_category" in update_fields
        ) and (
            float(existing.get("quantity") or 1) != 1.0
            or existing.get("quantity_items")
            or _has_video_duration(existing)
        ):
            update_fields.update({"quantity": 1.0, "quantity_items": []})
            _clear_video_duration(update_fields)
        return

    if stage != "Animate":
        if update_fields.get("video_duration_seconds") is not None:
            raise HTTPException(status_code=400, detail="Duration applies to Animate rows only.")
        if "stage" in update_fields and _has_video_duration(existing):
            _clear_video_duration(update_fields)

    if "quantity" in update_fields:
        raw = _valid_minutes(update_fields["quantity"])
        if raw is None or raw != int(raw) or raw < 1 or raw > MAX_QUANTITY:
            raise HTTPException(
                status_code=400,
                detail=f"Quantity must be a whole number from 1 to {MAX_QUANTITY}.",
            )
        update_fields["quantity"] = float(int(raw))

    if "quantity_items" in update_fields or ("quantity" in update_fields and existing.get("quantity_items")):
        units = units_of(merged)
        items = update_fields.get("quantity_items", existing.get("quantity_items")) or []
        cleaned = []
        for value in items[:units]:
            if value is None:
                cleaned.append(None)
                continue
            minutes = _valid_minutes(value)
            if minutes is None or minutes < 0 or minutes > MAX_WORK_ITEM_MINUTES:
                raise HTTPException(
                    status_code=400,
                    detail="Time for one unit must be a number of minutes (0 to 1440).",
                )
            cleaned.append(round(minutes, 2) if minutes > 0 else None)
        # Keep one slot per unit so the panel and the total always agree.
        cleaned += [None] * (units - len(cleaned))
        update_fields["quantity_items"] = cleaned


# A bulk update applies the same patch to many rows, so the same benchmark /
# client / project would otherwise be looked up once PER ROW - each one a
# database round trip, which is what made "change status" on a big selection
# take seconds. A bulk endpoint sets this to a dict for the duration of the
# request and the lookups below share it; outside a bulk request it is None
# and nothing is cached.
_lookup_cache: ContextVar[Optional[dict]] = ContextVar("lookup_cache", default=None)


async def _cached_lookup(key: tuple, fetch):
    cache = _lookup_cache.get()
    if cache is None:
        return await fetch()
    if key not in cache:
        cache[key] = await fetch()
    return cache[key]


async def get_time_benchmark(user_ids: list, deliverable_type: Optional[str]) -> Optional[float]:
    """Minutes-per-unit the first of `user_ids` has set for this activity, or None.
    Only Core activities have targets, so Non-Core types never have a benchmark."""
    if not deliverable_type:
        return None
    seen = set()
    for uid in user_ids:
        if not uid or uid in seen:
            continue
        seen.add(uid)
        doc = await _cached_lookup(
            ("benchmark", uid, deliverable_type),
            lambda uid=uid: db.efficiency_employee_targets.find_one(
                {"user_id": uid, "activity_name": deliverable_type, "active": {"$ne": False}},
                {"_id": 0, "time_per_unit_minutes": 1},
            ),
        )
        minutes = _valid_minutes((doc or {}).get("time_per_unit_minutes"))
        if minutes and minutes > 0:
            return round(minutes, 2)
    return None


def _time_worker_ids(user, existing: dict, creator_id: Optional[str]) -> list:
    """Whose benchmark applies. Members log their own work (the acting user);
    a manager editing a row is reviewing someone else's, so the row's creator
    comes first."""
    creator = creator_id or existing.get("creator_id")
    return [user.id, creator] if user.role == "member" else [creator, user.id]


async def apply_time_rules(user, existing: dict, update_fields: dict, creator_id: Optional[str] = None) -> None:
    """Validate `time_taken_minutes`, auto-fill it from the benchmark and enforce
    "time is required before a row moves forward". Mutates update_fields; raises
    HTTPException(400) on a violation. `existing` is {} when creating."""
    time_in_patch = "time_taken_minutes" in update_fields
    units = units_of({**existing, **update_fields})
    old_units = units_of(existing)

    # Per-unit times typed in the Qty panel decide the row's time: each typed
    # unit counts as typed, every other unit as the worker's benchmark for the
    # type (when there is one). Nothing typed at all hands the time back to the
    # benchmark (units x benchmark) like clearing the Time box does.
    items_in_patch = "quantity_items" in update_fields
    unit_benchmark = None
    if items_in_patch or "quantity" in update_fields:
        unit_type = update_fields.get("deliverable_type", existing.get("deliverable_type")) or ""
        if unit_type:
            unit_benchmark = await get_time_benchmark(
                _time_worker_ids(user, existing, creator_id), unit_type
            )
    if items_in_patch:
        typed = [v for v in (update_fields["quantity_items"] or []) if v]
        if typed:
            filler = unit_benchmark or 0.0
            update_fields["time_taken_minutes"] = round(
                sum(v if v else filler for v in update_fields["quantity_items"]), 2
            )
            time_in_patch = True
        elif unit_benchmark and any(existing.get("quantity_items") or []):
            # Every typed unit was just cleared: back to the benchmark.
            update_fields["time_taken_minutes"] = 0
            time_in_patch = True

    if time_in_patch:
        raw = update_fields["time_taken_minutes"]
        minutes = 0.0 if raw is None else _valid_minutes(raw)
        if minutes is None or minutes < 0:
            raise HTTPException(
                status_code=400,
                detail="Time taken must be a number of minutes (0 or more).",
            )
        # 24 hours per unit: a 23-slide deck row may hold 23 days of slides.
        if minutes > MAX_WORK_ITEM_MINUTES * units:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Time for a single row cannot exceed 24 hours (1440 minutes)"
                    + (" per unit" if units > 1 else "")
                    + ". Split it across rows."
                ),
            )
        update_fields["time_taken_minutes"] = round(minutes, 2)

    new_type = update_fields.get("deliverable_type", existing.get("deliverable_type")) or ""
    old_type = existing.get("deliverable_type") or ""
    type_changed = "deliverable_type" in update_fields and new_type != old_type
    new_status = update_fields.get("status")
    moving_forward = new_status in TIME_GATED_STATUSES and new_status != existing.get("status")

    units_changed = units != old_units
    if not (time_in_patch or type_changed or moving_forward or units_changed):
        return

    current = (
        update_fields["time_taken_minutes"]
        if time_in_patch
        else (_valid_minutes(existing.get("time_taken_minutes")) or 0.0)
    )
    source = existing.get("time_source") or "manual"

    benchmark = None
    if new_type:
        benchmark = await get_time_benchmark(_time_worker_ids(user, existing, creator_id), new_type)
        # The benchmark is per unit; a row covering N units is expected to take N times it.
        if benchmark:
            benchmark = round(benchmark * units, 2)

    if time_in_patch:
        if current <= 0 and benchmark:
            # Clearing the box means "go back to my benchmark", never "leave it empty".
            current, source = benchmark, "auto"
        elif benchmark and abs(current - benchmark) < 0.01:
            source = "auto"
        else:
            source = "manual"
    elif type_changed:
        if not new_type or not benchmark:
            # An auto value belonged to the OLD type. Leaving it would count, say,
            # 120 minutes of "Collateral" as time spent on a meeting - so reset it.
            if source == "auto":
                current, source = 0.0, "manual"
        elif current <= 0 or source == "auto":
            current, source = benchmark, "auto"
        # else: a person typed this value; keep it (edge case), only the benchmark moves.
    elif units_changed:
        # Changing the quantity rescales a time the app filled in itself;
        # a time a person typed is left alone.
        if benchmark and (current <= 0 or source == "auto"):
            current, source = benchmark, "auto"

    if moving_forward and current <= 0:
        if benchmark:
            current, source = benchmark, "auto"
        else:
            raise HTTPException(status_code=400, detail=TIME_REQUIRED_MESSAGE)

    # Only a time a person typed (or kept while switching type) is checked, and
    # only when it is being entered now - closing or reviewing a row never
    # trips over an old low value. Admins are exempt, and with no benchmark
    # there is nothing to compare against.
    if (
        (time_in_patch or type_changed or units_changed)
        and source == "manual"
        and benchmark
        and 0 < current < LOW_TIME_RATIO * benchmark
        and new_type not in LOW_TIME_EXEMPT_TYPES
        and getattr(user, "role", None) != "admin"
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"{_minutes_label(current)} min is far below your benchmark of "
                f"{_minutes_label(benchmark)} min for {new_type}. If this was a "
                "revision or small fix, select 'Changes' as the type instead."
            ),
        )

    update_fields["time_taken_minutes"] = current
    update_fields["time_source"] = source
    update_fields["time_benchmark_minutes"] = benchmark


MIN_WORK_DATE = "2000-01-01"
MAX_WORK_DATE = "2100-12-31"


def validate_work_date(value: str) -> None:
    """A saved work_date must be a real YYYY-MM-DD date between 2000 and 2100.
    A half-typed year in a date field (0002, 0006...) used to be saved as-is,
    which sorted the row to the very bottom and put it in a nonsense month."""
    parsed = None
    try:
        parsed = datetime.strptime(value, "%Y-%m-%d")
    except (TypeError, ValueError):
        pass

    if (
        parsed is None
        or f"{parsed.year:04d}-{parsed.month:02d}-{parsed.day:02d}" != value
        or not (MIN_WORK_DATE <= value <= MAX_WORK_DATE)
    ):
        raise HTTPException(
            status_code=400,
            detail="Work date must be a valid date between 2000 and 2100.",
        )


# Moving a row out of "Not Started" needs a deliverable (or "Not available").
# Reviewer statuses (Changes Requested / Rework / Closed) are deliberately not
# gated: a reviewer must not be blocked by a gap the creator left.
DELIVERABLE_GATED_STATUSES = {"Ongoing", "Ready for Review"}


def deliverable_required_for(merged: dict) -> bool:
    """A deliverable is expected on client work: rows that have a project and
    are not Non-Core (meetings, hiring, trainings...). Rows with no project
    have no deliverable list to choose from, so they are exempt."""
    if not merged.get("project_id"):
        return False
    category = merged.get("work_category")
    if not category:
        category = DELIVERABLE_TYPE_CATEGORIES.get(merged.get("deliverable_type") or "")
    return category != "Non-Core"


def apply_deliverable_rules(existing: dict, update_fields: dict) -> None:
    """Keep deliverable_id / deliverable_not_available consistent and enforce
    the compulsory-deliverable rule. Mutates update_fields; raises
    HTTPException(400) on a violation. `existing` is {} when creating."""
    if "deliverable_not_available" in update_fields:
        update_fields["deliverable_not_available"] = bool(update_fields["deliverable_not_available"])

    if update_fields.get("deliverable_id"):
        # A real deliverable always wins over the "Not available" flag.
        update_fields["deliverable_not_available"] = False
    elif update_fields.get("deliverable_not_available"):
        update_fields["deliverable_id"] = None
    elif "deliverable_not_available" not in update_fields and (
        "deliverable_id" in update_fields  # explicitly cleared
        or update_fields.get("project_id", existing.get("project_id")) != existing.get("project_id")
        or update_fields.get("client_id", existing.get("client_id")) != existing.get("client_id")
    ):
        # Clearing the deliverable, or moving the row to another project or
        # client, invalidates a previous "Not available" choice.
        update_fields["deliverable_not_available"] = False

    merged = {**existing, **update_fields}

    if merged.get("deliverable_not_available") and not merged.get("project_id"):
        raise HTTPException(
            status_code=400,
            detail="Select a project before marking the deliverable as Not available.",
        )

    new_status = update_fields.get("status")
    if (
        new_status in DELIVERABLE_GATED_STATUSES
        and new_status != existing.get("status")
        and deliverable_required_for(merged)
        and not (merged.get("deliverable_id") or merged.get("deliverable_not_available"))
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Please select a deliverable (or choose 'Not available') "
                "before moving this row forward."
            ),
        )


async def scoped_update_fields(
    user: "User",
    existing: dict,
    update_fields: dict,
    creator_department: Optional[str] = None,
    creator_role: Optional[str] = None,
) -> dict:
    """Apply role-based restrictions to a raw update payload. Raises HTTPException on violation."""
    # Admins can edit every row and every field on the Work Sheet; only members
    # and managers are scoped to their own rows / department below.
    if user.role == "member":
        # A row with a named creator is theirs alone - a teammate (same
        # department, same stage) can no longer edit it, regardless of
        # whether that creator is a member, manager, or admin. Only a row
        # with NO creator at all (e.g. "Add N Rows" provisioning blank team
        # rows, which now leaves creator_id empty for that reason - see
        # bulk_create_work_items) stays open to the whole department.
        creator_id = existing.get("creator_id")
        if creator_id and creator_id != user.id:
            raise HTTPException(
                status_code=403,
                detail="This row was created by a teammate, so only they (or a manager) can edit it.",
            )
        # Members share rows within their department/stage otherwise.
        department_stage = {
            "Content": "Content",
            "Design": "Design",
            "Animation": "Animate",
        }.get(user.department)
        if existing.get("stage") and department_stage and existing.get("stage") != department_stage:
            raise HTTPException(status_code=403, detail="You can only edit work items in your department")
        update_fields = {k: v for k, v in update_fields.items() if k in MEMBER_EDITABLE_FIELDS}
        if "stage" in update_fields and department_stage and update_fields["stage"] != department_stage:
            raise HTTPException(status_code=403, detail="Members can only assign work to their department")
    elif user.role == "manager":
        # A row nobody has been named on yet (e.g. blank rows added before
        # managers owned the rows they add) belongs to whoever works its stage,
        # so a manager of that stage may edit it - mainly to pick its creator.
        blank_row_in_own_stage = (
            not existing.get("creator_id")
            and DEPARTMENT_TO_STAGE.get(user.department) is not None
            and existing.get("stage") in (None, "", DEPARTMENT_TO_STAGE.get(user.department))
        )
        if not blank_row_in_own_stage and (
            not creator_department or creator_department != user.department
        ):
            raise HTTPException(status_code=403, detail="You can only edit work items logged by your own department")
    if "client_id" in update_fields and update_fields["client_id"]:
        client_id = update_fields["client_id"]
        client = await _cached_lookup(
            ("client", client_id),
            lambda: db.clients.find_one({"id": client_id}, {"_id": 0, "id": 1}),
        )
        if not client:
            raise HTTPException(status_code=400, detail="Invalid client")

    if "project_id" in update_fields and update_fields["project_id"]:
        project_id = update_fields["project_id"]
        project = await _cached_lookup(
            ("project", project_id),
            lambda: db.projects.find_one({"id": project_id}, {"_id": 0, "client_id": 1}),
        )
        if not project:
            raise HTTPException(status_code=400, detail="Invalid project")
        project_client_id = project.get("client_id")
        if update_fields.get("client_id") and update_fields["client_id"] != project_client_id:
            raise HTTPException(status_code=400, detail="Project does not belong to selected client")
        update_fields["client_id"] = project_client_id

    await validate_deliverable_ids(update_fields, existing)

    if "work_date" in update_fields and update_fields["work_date"]:
        validate_work_date(update_fields["work_date"])
        update_fields["month"] = update_fields["work_date"][:7]

    if (
        user.role == "member"
        and update_fields.get("status") == "Ready for Review"
    ):
        reviewer_id = update_fields.get(
            "reviewer_id",
            existing.get("reviewer_id")
        )

        if not reviewer_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Please assign a reviewer before "
                    "marking this as Ready for Review."
                ),
            )

    if "stage" in update_fields and update_fields["stage"] and update_fields["stage"] not in STAGES:
        raise HTTPException(status_code=400, detail="Invalid stage")

    apply_deliverable_rules(existing, update_fields)
    apply_quantity_rules(existing, update_fields)
    await apply_time_rules(user, existing, update_fields)

    validate_work_category_rules({**existing, **update_fields})
    return update_fields
