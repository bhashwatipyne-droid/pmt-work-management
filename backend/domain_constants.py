"""Shared domain constants (stages, statuses, categories, department mapping).

They live here, not in server.py, so the rule modules can use them without
importing the whole application. server.py re-exports them, so existing
`server.STAGES`-style references keep working.
"""

STAGES = ["Content", "Design", "Animate"]

# A row in one of these is finished for every count and rule that used to look
# for "Closed" alone: efficiency, the sidebar's pending badge, dashboards and
# the Non-Core "needs time before it can be closed" check. Scrap is treated the
# same as Closed - the time was spent either way.
DONE_STATUSES = ("Closed", "Scrap")

MEMBER_EDITABLE_FIELDS = {"quantity", "quantity_items", "deliverable_ids", "video_duration_seconds", "video_duration_minutes","work_date", "version", "time_taken_minutes", "remarks", "status", "client_id", "project_id", "deliverable_id", "deliverable_not_available", "stage", "deliverable_name", "deliverable_type", "deliverable_link", "reviewer_id", "work_category"}

DELIVERABLE_TYPE_CATEGORIES = {
    # Core
    "Other Initiatives": "Core",
    "Client Meets & Discussions": "Core",
    "Team Reviews and Feedback": "Core",
    "Campaign Ideation Plan (Includes Keywords)": "Core",
    "Campaign Ideation Plan (Quantitative Analysis)": "Core",
    "Campaign Ideation Plan (Content Peer Analysis)": "Core",
    "Campaign Ideation Plan (Key Visuals / Taglines)": "Core",
    "Teaser": "Core",
    "Minimalist": "Core",
    "Emailers": "Core",
    "Newsletters": "Core",
    "Carousel": "Core",
    "One Pager / Infographic": "Core",
    "Brochure": "Core",
    "Booklet": "Core",
    "Presentation (PPT) - Per Slide": "Core",
    "Typeform / Polls / Quiz": "Core",
    "Collateral": "Core",
    "GIF": "Core",
    "Reel / Short Video": "Core",
    "Long Video": "Core",
    "Video Storyboard": "Core",
    "Poster": "Core",
    "Data Research and Analysis (SMI)": "Core",
    "Data Research and Analysis (Web)": "Core",
    "Data Updation": "Core",
    "Changes": "Core",
    "Two Pager": "Core",
    "Teaser Short Video": "Core",

    # Non-Core
    "Project Briefing": "Non-Core",
    "Campaign Ideation Discussions": "Non-Core",
    "Clarity / Query / Doubt / Feedback Discussions": "Non-Core",
    "Core Team / Content Team / CEO Discussions": "Non-Core",
    "Trainings / Committee / Reviews Meetings": "Non-Core",
    "SOP and Process Improvements - Documentation": "Non-Core",
    "Hiring and Interviews": "Non-Core",
    "Follow Up (Over 10-15 mins)": "Non-Core",
}

DEPARTMENT_TO_STAGE = {
    "Content": "Content",
    "Design": "Design",
    "Animation": "Animate",
}

CLIENT_STATUSES = ["Active", "Inactive"]
