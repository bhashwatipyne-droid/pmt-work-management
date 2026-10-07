"""Spotting a project that is probably a copy of one made recently.

Pure functions: no database, no web framework. server.py fetches the candidate
projects (same client, touched lately) and these functions decide which of them
really are "the same project" and how to describe them to the person creating one.

Two projects are the same when they belong to the same client and their names are
the same once case, punctuation and extra spaces are ignored, so "Bajaj Brochures",
"bajaj  brochures" and "Bajaj_Brochures" all match. A project only counts if it was
created or last changed within the last DUPLICATE_WINDOW_DAYS days, and hidden
projects never count (someone already put them away on purpose).
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

DUPLICATE_WINDOW_DAYS = 30

# The same name for the same client created this close together is one person
# pressing Create twice (or a client retrying a slow request), never two jobs.
DOUBLE_SUBMIT_SECONDS = 15


def normalize_project_name(name: Any) -> str:
    """Lower-case, with "&" read as "and" and every run of punctuation,
    underscores or spaces collapsed to a single space."""
    text = str(name or "").casefold().replace("&", " and ")
    return " ".join(re.sub(r"[\W_]+", " ", text).split())


def parse_timestamp(value: Any) -> Optional[datetime]:
    """A timezone-aware datetime from the timestamp formats this database holds
    ("2026-09-06T14:19:37Z", "2026-10-06T13:32:37.438252+00:00", "2026-10-06"),
    or None when it is missing or unreadable. Naive values are read as UTC."""
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _same_client(project: Dict[str, Any], client_id: Optional[str]) -> bool:
    return (project.get("client_id") or None) == (client_id or None)


def find_recent_duplicates(
    projects: Iterable[Dict[str, Any]],
    client_id: Optional[str],
    name: str,
    now: datetime,
    days: int = DUPLICATE_WINDOW_DAYS,
    exclude_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """The projects in `projects` that look like a copy of (client_id, name),
    newest first. Each is a small summary the UI can show as is."""
    wanted = normalize_project_name(name)
    if not wanted:
        return []
    cutoff = now - timedelta(days=days)

    found = []
    for project in projects:
        if project.get("hidden") is True or project.get("id") == exclude_id:
            continue
        if not _same_client(project, client_id):
            continue
        if normalize_project_name(project.get("name")) != wanted:
            continue
        created = parse_timestamp(project.get("created_at"))
        touched = max(
            (t for t in (created, parse_timestamp(project.get("updated_at"))) if t),
            default=None,
        )
        if touched is None or touched < cutoff:
            continue
        found.append((touched, {
            "id": project.get("id"),
            "code": project.get("code"),
            "name": project.get("name"),
            "status": project.get("status"),
            "start_date": project.get("start_date"),
            "end_date": project.get("end_date"),
            "created_at": project.get("created_at"),
            # Whole days since it appeared (or was last changed, for one with no
            # readable creation time); 0 means today.
            "days_ago": max(0, (now - (created or touched)).days),
        }))

    found.sort(key=lambda pair: pair[0], reverse=True)
    return [summary for _, summary in found]


def find_double_submit(
    projects: Iterable[Dict[str, Any]],
    client_id: Optional[str],
    name: str,
    now: datetime,
    seconds: int = DOUBLE_SUBMIT_SECONDS,
) -> Optional[Dict[str, Any]]:
    """The project that was created for (client_id, name) only a moment ago, if
    any: a double click or a retried request, to be answered with that project
    instead of creating a second one."""
    wanted = normalize_project_name(name)
    if not wanted:
        return None
    cutoff = now - timedelta(seconds=seconds)
    newest, newest_at = None, None
    for project in projects:
        if not _same_client(project, client_id):
            continue
        if normalize_project_name(project.get("name")) != wanted:
            continue
        created = parse_timestamp(project.get("created_at"))
        if created is None or created < cutoff or created > now + timedelta(seconds=seconds):
            continue
        if newest_at is None or created > newest_at:
            newest, newest_at = project, created
    return newest
