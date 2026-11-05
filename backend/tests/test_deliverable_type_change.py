"""Changing the Deliverable Type must not wipe the row's deliverable."""
import asyncio
import os
import sys
from pathlib import Path

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "pmt_test")
os.environ.setdefault("JWT_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from work_items_rules import (  # noqa: E402
    apply_deliverable_rules,
    apply_quantity_rules,
    validate_deliverable_ids,
)

EXISTING = {
    "stage": "Content",
    "project_id": "p1",
    "deliverable_id": "d1",
    "deliverable_not_available": False,
    "deliverable_type": "Campaign Ideation Plan (SMI)",
    "work_category": "Core",
    "deliverable_ids": ["d1"],
    "quantity": 1.0,
    "quantity_items": [None],
}


def run_rules(existing, patch):
    asyncio.run(validate_deliverable_ids(patch, existing))
    apply_deliverable_rules(existing, patch)
    apply_quantity_rules(existing, patch)
    return {**existing, **patch}


def test_leaving_a_multi_deliverable_type_keeps_the_deliverable():
    merged = run_rules(
        EXISTING,
        {"deliverable_type": "Carousel", "work_category": "Core",
         "deliverable_ids": [], "quantity": 1, "quantity_items": []},
    )
    assert merged["deliverable_id"] == "d1"
    assert merged["deliverable_not_available"] is False
    assert merged["deliverable_ids"] == []


def test_plain_type_change_keeps_the_deliverable():
    existing = {**EXISTING, "deliverable_type": "Carousel", "deliverable_ids": []}
    merged = run_rules(existing, {"deliverable_type": "Poster", "work_category": "Core"})
    assert merged["deliverable_id"] == "d1"
