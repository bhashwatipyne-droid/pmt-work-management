"""Efficiency honours the team-specific categories (no live server needed).

Data Updation is a Core activity for every team except Animation, where it is
Non-Core. Builds the efficiency router with no database (these helpers never
touch it) and pulls the closures out the same way test_efficiency_scope.py does.
"""
from types import SimpleNamespace

import efficiency
from domain_constants import DELIVERABLE_TYPE_CATEGORIES


def _hooks():
    captured = {}
    router = efficiency.create_efficiency_router(
        db=SimpleNamespace(),
        get_acting_user=None,
        require_manager_or_admin=None,
        now_iso=lambda: "",
        log_activity=None,
        deliverable_type_categories=DELIVERABLE_TYPE_CATEGORIES,
    )
    for route in router.routes:
        fn = getattr(route, "endpoint", None)
        if fn and fn.__closure__:
            for name, cell in zip(fn.__code__.co_freevars, fn.__closure__):
                captured.setdefault(name, cell.cell_contents)
    return captured


def _free_var(fn, name):
    return next(c.cell_contents for n, c in zip(fn.__code__.co_freevars, fn.__closure__) if n == name)


H = _hooks()
category_of = H["_category_of"]
compute_employee = _free_var(H["_build_months"], "_compute_employee")

CAPACITY = {"working_days": 20, "leave_days": 0, "working_hours_per_day": 8}
TARGETS = [
    {"id": "t-du", "activity_name": "Data Updation", "time_per_unit_minutes": 30},
    {"id": "t-poster", "activity_name": "Poster", "time_per_unit_minutes": 60},
]


def data_updation_row(stage):
    # saved as Core, the way rows were before the rule existed
    return {
        "stage": stage, "deliverable_type": "Data Updation", "work_category": "Core",
        "status": "Closed", "time_taken_minutes": 60, "quantity": 1,
    }


def employee(department, stage):
    return compute_employee(
        {"id": "u1", "name": "U", "department": department, "role": "member"},
        CAPACITY,
        [data_updation_row(stage)],
        [dict(t) for t in TARGETS],
    )


def test_category_of_reads_animation_data_updation_as_non_core_even_when_saved_as_core():
    assert category_of(data_updation_row("Animate")) == "Non-Core"
    assert category_of(data_updation_row("Design")) == "Core"
    assert category_of(data_updation_row("Content")) == "Core"
    # a row with no stage (older data) keeps what it was saved with
    assert category_of({"deliverable_type": "Data Updation", "work_category": "Core"}) == "Core"


def test_animation_data_updation_time_counts_as_non_core_and_not_as_closed_work():
    row = employee("Animation", "Animate")
    assert row["non_core_hours"] == 1.0
    assert row["closed_deliverables"] == 0
    assert dict(row["non_core_by_type"][0]) == {"deliverable_type": "Data Updation", "hours": 1.0}


def test_animation_no_longer_has_data_updation_as_a_core_target():
    names = [a["activity_name"] for a in employee("Animation", "Animate")["activities"]]
    assert names == ["Poster"]


def test_other_teams_keep_data_updation_as_core_work_and_a_core_target():
    for department, stage in (("Design", "Design"), ("Content", "Content")):
        row = employee(department, stage)
        assert row["non_core_hours"] == 0
        assert row["closed_deliverables"] == 1
        names = [a["activity_name"] for a in row["activities"]]
        assert names == ["Data Updation", "Poster"]
