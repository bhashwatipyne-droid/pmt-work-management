"""Row -> PMT mapping for the Premium Content sheet sync (pure functions)."""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from premium_sheet_sync import SheetRow, map_row, parse_month, plan_update, project_name  # noqa: E402


def test_months():
    assert parse_month(datetime(2026, 10, 26)) == (2026, 10)
    assert parse_month("Sept 26") == (2026, 9)
    assert parse_month("2026-05-26") == (2026, 5)
    assert parse_month("Before April 2025") is None
    assert project_name(2026, 10) == "TFP Oct-26"


def test_reel_in_scripting():
    m = map_row(SheetRow(month=datetime(2026, 10, 26), format="Reel", title=" A  title ", status="Scripting under Review", content_date="2026-11-02"))
    assert m["type"] == "Reel / Short Video" and m["stages"] == ["Content", "Design", "Animate"]
    assert m["current_stage"] == "Content" and not m["finished"]
    assert m["stage_schedule"] == {"Content": {"start_dt": None, "end_dt": "2026-11-02"}}
    assert m["title"] == "A title"


def test_uploaded_is_finished_at_last_stage():
    m = map_row(SheetRow(month="2026-10-01", format="Carousel", title="x", status="Uploaded"))
    assert m["finished"] and m["current_stage"] == "Design"


def test_skips():
    assert map_row(SheetRow(month="2026-10-01", format="Carousel", title="", status="Uploaded"))["skip"]
    assert "skip" in map_row(SheetRow(month="2026-10-01", format="Carousel", title="x", status="Dropped"))
    assert "skip" in map_row(SheetRow(month="2026-10-01", format="Carousel", title="x", status="Under Animation"))
    assert "skip" in map_row(SheetRow(month="2026-10-01", format="Podcast", title="x", status="Uploaded"))
    assert "skip" in map_row(SheetRow(month="2026-04-01", format="Carousel", title="x", status="Uploaded"))
    assert "skip" in map_row(SheetRow(month="Before April 2025", format="Reel", title="x", status="Uploaded"))


def test_update_plan_rename_dates_and_never_status():
    doc = {"name": "Old title", "type": "Carousel", "required_stages": ["Content", "Design"], "stage_schedule": {}}
    m = map_row(SheetRow(month="2026-10-01", format="Carousel", title="New title", status="Under Design", content_date="2026-11-02"), lenient=True)
    changes, notes = plan_update(doc, m)
    assert changes["name"] == "New title"
    assert changes["stage_schedule"] == {"Content": {"start_dt": None, "end_dt": "2026-11-02"}}
    assert "current_stage" not in changes and "stage_status" not in changes and not notes


def test_update_plan_type_needing_other_stages_is_left_alone():
    doc = {"name": "T", "type": "Carousel", "required_stages": ["Content", "Design"], "stage_schedule": {}}
    m = map_row(SheetRow(month="2026-10-01", format="Reel", title="T", status=""), lenient=True)
    changes, notes = plan_update(doc, m)
    assert "type" not in changes and notes


def test_update_plan_no_change():
    doc = {"name": "T", "type": "Carousel", "required_stages": ["Content", "Design"], "stage_schedule": {}}
    m = map_row(SheetRow(month="2026-10-01", format="Carousel", title="T"), lenient=True)
    assert plan_update(doc, m) == ({}, [])


def test_blank_status_is_allowed():
    from premium_sheet_sync import SheetRow, map_row
    m = map_row(SheetRow(month="2026-11-01", format="Reel", title="X", status=""))
    assert m["current_stage"] == "Content" and not m["finished"] and m["type"] == "Reel / Short Video"
