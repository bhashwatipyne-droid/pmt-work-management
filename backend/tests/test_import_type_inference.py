import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from deliverable_import import validate_table
from domain_constants import DELIVERABLE_TYPE_CATEGORIES

def run(t):
    r = validate_table([["Name", "Type"], ["x", t]], list(DELIVERABLE_TYPE_CATEGORIES), ["Content", "Design", "Animate"], [], set())
    row = r["rows"][0] if "rows" in r else r["results"][0]
    return row

def info(t):
    row = run(t)
    return row

import pytest

@pytest.mark.parametrize("raw,expected", [
    ("Video", "Long Video"), ("videos", "Long Video"), ("Short Video", "Reel / Short Video"),
    ("Storyboard", "Video Storyboard"), ("Poll", "Typeform / Polls / Quiz"),
    ("Carosel", "Carousel"), ("PPT", "Presentation (PPT) - Per Slide"),
])
def test_inferred(raw, expected):
    row = run(raw)
    blob = repr(row)
    assert expected in blob and "Unknown type" not in blob

def test_nonsense_still_flagged():
    assert "Unknown type" in repr(run("Zebra crossing"))
