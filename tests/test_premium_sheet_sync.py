"""Row -> PMT mapping for the Premium Content sheet sync (pure functions)."""
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from premium_sheet_sync import SheetRow, map_row, parse_month, project_name  # noqa: E402


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
