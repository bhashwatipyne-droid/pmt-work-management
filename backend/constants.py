"""Fixed lists and limits: deliverable types, statuses, stages, project statuses,
unit-row settings and the like. Moved out of server.py unchanged."""
import re  # noqa: F401
from typing import List  # noqa: F401

DELIVERABLE_TYPES = [
    # Core
    "Other Initiatives",
    "Client Meets & Discussions",
    "Team Reviews and Feedback",
    "Campaign Ideation Plan (Includes Keywords)",
    "Campaign Ideation Plan (Quantitative Analysis)",
    "Campaign Ideation Plan (Content Peer Analysis)",
    "Campaign Ideation Plan (Key Visuals / Taglines)",
    "Teaser",
    "Minimalist",
    "Emailers",
    "Newsletters",
    "Carousel",
    "One Pager / Infographic",
    "Brochure",
    "Booklet",
    "Presentation (PPT) - Per Slide",
    "Typeform / Polls / Quiz",
    "Collateral",
    "GIF",
    "Reel / Short Video",
    "Long Video",
    "Video Storyboard",
    "Poster",
    "Data Research and Analysis (SMI)",
    "Data Research and Analysis (Web)",
    "Data Updation",
    "Changes",
    "Two Pager",
    "Teaser Short Video",

    # Non-Core
    "Project Briefing",
    "Campaign Ideation Discussions",
    "Clarity / Query / Doubt / Feedback Discussions",
    "Core Team / Content Team / CEO Discussions",
    "Trainings / Committee / Reviews Meetings",
    "SOP and Process Improvements - Documentation",
    "Hiring and Interviews",
    "Follow Up (Over 10-15 mins)",
]

WORK_CATEGORIES = ["Core", "Non-Core"]

# Deliverable types that are measured one unit at a time (the "Activity
# Potential" unit basis). Value = what one unit is called; the Work Sheet's Qty
# column uses it to say "23 slides" / "4 pages" (Animate rows always count
# scenes instead). The older "one row per unit" endpoint reads it too.
DELIVERABLE_TYPE_UNITS = {
    "Presentation (PPT) - Per Slide": "Slide",
    "Carousel": "Slide",
    "Reel / Short Video": "Reel",
    "Booklet": "Page",
    "Brochure": "Page",
    "Two Pager": "Page",
    "Video Storyboard": "Frame",
    "Teaser": "Video",
    "Teaser Short Video": "Video",
    "Long Video": "Video",
    "Poster": "Post",
    "Minimalist": "Post",
    "GIF": "GIF",
}
MAX_UNIT_ROWS = 100
# Only this department gets the per-unit editor (members and managers).
UNIT_ROWS_DEPARTMENT = "Design"

STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Changes Requested", "Rework", "Closed", "Scrap"]
# "On Hold" is a pause a member can set on their own row (e.g. waiting on a
# client), same as Ongoing/Ready for Review - it does not need a reviewer.
# "Scrap" is work thrown away; the row's owner can set it without a review.
MEMBER_FORWARD_STATUSES = ["Not Started", "Ongoing", "On Hold", "Ready for Review", "Scrap"]
PROJECT_STATUSES = [
    "Active",
    "Approval Pending",
    "Completed",
    "Ready for Invoice",
    "Raised Invoice",
    "On Hold",
    "Scrapped",
]
# How many projects one list call may return. The Projects board, the Work
# Sheet pickers and the command palette all want the whole portfolio; a low
# default (it used to be 100) silently hid every project past the newest 100.
PROJECT_LIST_LIMIT = 5000


def search_clauses(search: str, fields: List[str]) -> List[dict]:
    """Forgiving text search: one clause per word typed, each of which must
    match one of `fields`. Punctuation and spacing in the query are ignored,
    and the words may sit apart in the stored text, so "absl -spl" finds
    "ABSL - SPL Campaign". Returns [] when the query has no searchable words."""
    words = re.findall(r"\w+", search or "", re.UNICODE)[:8]
    return [
        {"$or": [{f: {"$regex": re.escape(w), "$options": "i"}} for f in fields]}
        for w in words
    ]


STAGE_STATUSES = ["Not Started", "In Progress", "Ready for Review", "Changes Requested", "Completed"]
DEPARTMENTS = ["Content", "Design", "Animation", "Administration"]
# "hr" (Finance) is its own role, separate from admin, manager and member: it only
# sees the invoicing screens (see HR_ALLOWED_PREFIXES) and is not part of the
# production team, so it is left out of team, efficiency and workload lists.
ROLES = ["admin", "manager", "member", "hr"]
HR_ALLOWED_PREFIXES = (
    "/api/auth/",
    "/api/invoicing/",
    "/api/notifications",
    "/api/push/",
    "/api/config/",
)
APPROVAL_TYPES = ["MANAGER", "LEADERSHIP", "CLIENT_SPOC", "COMPLIANCE"]
APPROVAL_STATUSES = ["NOT_STARTED", "PENDING", "APPROVED", "CHANGES_REQUESTED"]
