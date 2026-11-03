"""Work Sheet row rules (work_items_rules.py).

These pin the behaviour the rules had when they lived inside server.py, so later
refactors that move or tidy them cannot change what a row is allowed to do.
Pure functions only: no database or live server needed.
"""
import os
import sys

import pytest
from fastapi import HTTPException

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "rules_test")
os.environ.setdefault("JWT_SECRET", "rules-test-secret-0123456789abcdef")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import server  # noqa: E402
import work_items_rules as rules  # noqa: E402


def status_of(fn, *args):
    try:
        fn(*args)
    except HTTPException as exc:
        return exc.status_code
    return None


# ------------------------------------------------------------------ work date
@pytest.mark.parametrize("value", ["2026-10-21", "2000-01-01", "2100-12-31", "2024-02-29"])
def test_real_dates_between_2000_and_2100_are_accepted(value):
    assert status_of(rules.validate_work_date, value) is None


@pytest.mark.parametrize(
    "value",
    ["0002-03-04", "1999-12-31", "2101-01-01", "2026-02-30", "2026-13-01", "2026-1-5", "21-10-2026", "", None],
)
def test_nonsense_dates_are_rejected(value):
    assert status_of(rules.validate_work_date, value) == 400


# ------------------------------------------------- Non-Core rows need time to close
def test_non_core_row_cannot_be_closed_without_time():
    row = {"work_category": "Non-Core", "status": "Closed", "time_taken_minutes": 0}
    assert status_of(rules.validate_work_category_rules, row) == 400


def test_non_core_row_can_be_closed_with_time_and_scrap_counts_as_closed():
    assert status_of(rules.validate_work_category_rules, {"work_category": "Non-Core", "status": "Closed", "time_taken_minutes": 30}) is None
    assert status_of(rules.validate_work_category_rules, {"work_category": "Non-Core", "status": "Scrap"}) == 400


def test_core_rows_and_open_rows_are_not_blocked():
    assert status_of(rules.validate_work_category_rules, {"work_category": "Core", "status": "Closed"}) is None
    assert status_of(rules.validate_work_category_rules, {"work_category": "Non-Core", "status": "Ongoing"}) is None


def test_category_falls_back_to_the_deliverable_type():
    non_core_type = next(t for t, c in server.DELIVERABLE_TYPE_CATEGORIES.items() if c == "Non-Core")
    assert status_of(rules.validate_work_category_rules, {"deliverable_type": non_core_type, "status": "Closed"}) == 400


# --------------------------------- team-specific categories: Animation / Data Updation
def test_data_updation_is_non_core_for_the_animation_team_only():
    def category(stage):
        return rules.resolve_work_category(
            {"stage": stage, "deliverable_type": "Data Updation", "work_category": "Core"}
        )

    assert category("Animate") == "Non-Core"
    # every other team keeps it as a Core activity
    for stage in ("Content", "Design", None, ""):
        assert category(stage) == "Core"
    # the shared type table itself is unchanged
    assert server.DELIVERABLE_TYPE_CATEGORIES["Data Updation"] == "Core"


def test_only_data_updation_on_the_animate_stage_is_overridden():
    assert rules.category_override("Animate", "Data Updation") == "Non-Core"
    assert rules.category_override("Animate", "Poster") is None
    assert rules.category_override("Design", "Data Updation") is None
    assert rules.category_override(None, None) is None


def test_animation_data_updation_needs_time_before_it_can_close_but_other_teams_do_not():
    animate = {
        "stage": "Animate", "deliverable_type": "Data Updation", "work_category": "Core",
        "status": "Closed", "time_taken_minutes": 0,
    }
    assert status_of(rules.validate_work_category_rules, animate) == 400
    assert status_of(rules.validate_work_category_rules, {**animate, "time_taken_minutes": 30}) is None
    assert status_of(rules.validate_work_category_rules, {**animate, "stage": "Design"}) is None
    assert status_of(rules.validate_work_category_rules, {**animate, "stage": "Content"}) is None


def test_animation_data_updation_no_longer_needs_a_deliverable_but_other_teams_still_do():
    row = {"project_id": "p1", "stage": "Animate", "deliverable_type": "Data Updation", "work_category": "Core"}
    assert not rules.deliverable_required_for(row)
    assert rules.deliverable_required_for({**row, "stage": "Design"})
    assert rules.deliverable_required_for({**row, "stage": "Content"})
    assert rules.deliverable_required_for({**row, "deliverable_type": "Poster"})


def test_a_new_animation_data_updation_row_is_saved_as_non_core_whatever_the_client_sent():
    for sent in ("Core", "", None):
        data = {"stage": "Animate", "deliverable_type": "Data Updation", "work_category": sent}
        rules.apply_category_override({}, data)
        assert data["work_category"] == "Non-Core"

    other_team = {"stage": "Design", "deliverable_type": "Data Updation", "work_category": "Core"}
    rules.apply_category_override({}, other_team)
    assert other_team["work_category"] == "Core"


def test_editing_an_animation_row_into_data_updation_makes_it_non_core():
    existing = {"stage": "Animate", "deliverable_type": "Poster", "work_category": "Core"}
    changes = {"deliverable_type": "Data Updation", "work_category": "Core"}
    rules.apply_category_override(existing, changes)
    assert changes["work_category"] == "Non-Core"


def test_a_row_moved_out_of_the_override_goes_back_to_its_types_category():
    existing = {"stage": "Animate", "deliverable_type": "Data Updation", "work_category": "Non-Core"}

    new_type = {"deliverable_type": "Poster"}
    rules.apply_category_override(existing, new_type)
    assert new_type["work_category"] == "Core"

    new_stage = {"stage": "Design"}
    rules.apply_category_override(existing, new_stage)
    assert new_stage["work_category"] == "Core"


def test_an_unrelated_edit_does_not_rewrite_the_category():
    existing = {"stage": "Animate", "deliverable_type": "Data Updation", "work_category": "Non-Core"}
    changes = {"remarks": "updated the chart"}
    rules.apply_category_override(existing, changes)
    assert "work_category" not in changes

    plain = {"stage": "Design", "deliverable_type": "Poster", "work_category": "Core"}
    changes = {"remarks": "x"}
    rules.apply_category_override(plain, changes)
    assert "work_category" not in changes


# ------------------------------------------------------- multi-deliverable rows
def test_only_content_rows_of_the_multi_type_cover_several_deliverables():
    prefix = rules.MULTI_DELIVERABLE_TYPE_PREFIX
    assert rules.is_multi_deliverable_row({"stage": rules.MULTI_DELIVERABLE_STAGE, "deliverable_type": prefix + " extra"})
    assert not rules.is_multi_deliverable_row({"stage": "Design", "deliverable_type": prefix})
    assert not rules.is_multi_deliverable_row({"stage": rules.MULTI_DELIVERABLE_STAGE, "deliverable_type": "Poster"})
    assert not rules.is_multi_deliverable_row({})


def test_data_research_rows_on_the_content_sheet_cover_several_deliverables_too():
    stage = rules.MULTI_DELIVERABLE_STAGE
    for t in ("Data Research and Analysis (SMI)", "Data Research and Analysis (Web)"):
        assert rules.is_multi_deliverable_row({"stage": stage, "deliverable_type": t})
        assert not rules.is_multi_deliverable_row({"stage": "Design", "deliverable_type": t})
    # other Core types keep their typed Qty
    assert not rules.is_multi_deliverable_row({"stage": stage, "deliverable_type": "Data Updation"})


def test_team_reviews_cover_several_deliverables_on_every_teams_sheet():
    for stage in ("Content", "Design", "Animate"):
        assert rules.is_multi_deliverable_row({"stage": stage, "deliverable_type": "Team Reviews and Feedback"})
    assert not rules.is_multi_deliverable_row({"stage": "Design", "deliverable_type": "Changes"})


# ------------------------------------------------------- shared constants wiring
def test_server_still_exposes_the_moved_names_with_the_same_objects():
    """Other modules and tests reach these as server.<name>; they must be the very
    same objects the rules use, not copies that can drift apart."""
    for name in ("STAGES", "DONE_STATUSES", "MEMBER_EDITABLE_FIELDS", "DELIVERABLE_TYPE_CATEGORIES", "DEPARTMENT_TO_STAGE"):
        assert getattr(server, name) is getattr(rules, name), name
    for name in ("validate_work_date", "apply_time_rules", "scoped_update_fields", "validate_work_category_rules"):
        assert getattr(server, name) is getattr(rules, name), name
    assert server._lookup_cache is rules._lookup_cache


def test_department_to_stage_maps_every_team_to_a_real_stage():
    assert set(server.DEPARTMENT_TO_STAGE.values()) <= set(server.STAGES)
    assert server.DEPARTMENT_TO_STAGE["Animation"] == "Animate"
