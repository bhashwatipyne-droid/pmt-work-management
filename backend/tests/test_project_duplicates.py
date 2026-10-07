"""Unit tests for project_duplicates: which projects count as a recent copy.

Pure logic, no server or database needed."""
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from project_duplicates import (  # noqa: E402
    find_double_submit,
    find_recent_duplicates,
    normalize_project_name,
    parse_timestamp,
)

NOW = datetime(2026, 10, 7, 12, 0, tzinfo=timezone.utc)


def _project(pid="p1", name="Bajaj Brochures", client="CLIENT - 013", created=None, **extra):
    created = created or (NOW - timedelta(days=3)).isoformat()
    return {"id": pid, "name": name, "client_id": client, "created_at": created, "status": "Active", **extra}


def test_names_match_ignoring_case_punctuation_and_spacing():
    assert normalize_project_name("  Bajaj   Brochures ") == normalize_project_name("bajaj_brochures")
    assert normalize_project_name("TFP: Auto-generated Emailer") == normalize_project_name("tfp auto generated emailer")
    assert normalize_project_name("Q&A") == normalize_project_name("q and a")
    assert normalize_project_name(None) == ""


def test_parse_timestamp_reads_every_format_in_the_database():
    assert parse_timestamp("2026-09-06T14:19:37Z") == datetime(2026, 9, 6, 14, 19, 37, tzinfo=timezone.utc)
    assert parse_timestamp("2026-10-06T13:32:37.438252+00:00").day == 6
    assert parse_timestamp("2026-10-06").tzinfo is not None
    assert parse_timestamp("") is None
    assert parse_timestamp("not a date") is None
    assert parse_timestamp(None) is None


def test_same_client_same_name_created_recently_is_a_duplicate():
    found = find_recent_duplicates([_project()], "CLIENT - 013", "bajaj brochures", NOW)
    assert [d["id"] for d in found] == ["p1"]
    assert found[0]["days_ago"] == 3


def test_older_than_the_window_is_not_a_duplicate():
    old = _project(created=(NOW - timedelta(days=45)).isoformat())
    assert find_recent_duplicates([old], "CLIENT - 013", "Bajaj Brochures", NOW) == []


def test_an_old_project_changed_recently_still_counts():
    touched = _project(created=(NOW - timedelta(days=90)).isoformat(), updated_at=(NOW - timedelta(days=2)).isoformat())
    found = find_recent_duplicates([touched], "CLIENT - 013", "Bajaj Brochures", NOW)
    assert len(found) == 1
    assert found[0]["days_ago"] == 90


def test_window_edge_is_inclusive_of_exactly_thirty_days():
    edge = _project(created=(NOW - timedelta(days=30)).isoformat())
    assert len(find_recent_duplicates([edge], "CLIENT - 013", "Bajaj Brochures", NOW)) == 1
    past = _project(created=(NOW - timedelta(days=30, seconds=1)).isoformat())
    assert find_recent_duplicates([past], "CLIENT - 013", "Bajaj Brochures", NOW) == []


def test_other_client_other_name_and_hidden_projects_are_ignored():
    projects = [
        _project("other-client", client="CLIENT - 099"),
        _project("other-name", name="Bajaj Onepagers"),
        _project("hidden", hidden=True),
        _project("visible", hidden=False),
    ]
    found = find_recent_duplicates(projects, "CLIENT - 013", "Bajaj Brochures", NOW)
    assert [d["id"] for d in found] == ["visible"]


def test_projects_without_a_client_only_match_each_other():
    orphan = _project("orphan", client=None)
    assert [d["id"] for d in find_recent_duplicates([orphan], None, "Bajaj Brochures", NOW)] == ["orphan"]
    assert find_recent_duplicates([orphan], "CLIENT - 013", "Bajaj Brochures", NOW) == []


def test_the_project_being_edited_is_excluded_and_newest_comes_first():
    older = _project("older", created=(NOW - timedelta(days=9)).isoformat())
    newer = _project("newer", created=(NOW - timedelta(days=1)).isoformat())
    found = find_recent_duplicates([older, newer], "CLIENT - 013", "Bajaj Brochures", NOW)
    assert [d["id"] for d in found] == ["newer", "older"]
    assert [d["id"] for d in find_recent_duplicates([older, newer], "CLIENT - 013", "Bajaj Brochures", NOW, exclude_id="newer")] == ["older"]


def test_a_blank_name_matches_nothing():
    assert find_recent_duplicates([_project(name="")], "CLIENT - 013", "  ", NOW) == []


def test_double_submit_finds_a_project_made_seconds_ago():
    seconds_ago = _project("fresh", created=(NOW - timedelta(seconds=4)).isoformat())
    assert find_double_submit([seconds_ago], "CLIENT - 013", "Bajaj Brochures", NOW)["id"] == "fresh"


def test_double_submit_ignores_a_project_made_earlier_or_for_someone_else():
    earlier = _project("earlier", created=(NOW - timedelta(minutes=5)).isoformat())
    other = _project("other", client="CLIENT - 099", created=(NOW - timedelta(seconds=2)).isoformat())
    assert find_double_submit([earlier, other], "CLIENT - 013", "Bajaj Brochures", NOW) is None


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    for name, fn in tests:
        fn()
        print("ok  ", name)
    print(f"{len(tests)} passed")
