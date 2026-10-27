"""Notifications: Firebase push, creating / de-duplicating in-app notices,
stage hand-offs, new-project and overdue notices, and the daily reminders.

Moved out of server.py unchanged. These are plain functions that use the shared
database handle (db_client.db); the HTTP routes that list and mark notices read
stay in server.py for now.
"""
import asyncio
import json
import logging
import os
import threading
import uuid
import weakref
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional
from urllib.parse import quote
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pymongo import UpdateOne

try:
    from common import now_iso
    from db_client import db
    from domain_constants import ANY_MANAGER_APPROVAL_TYPES, DEPARTMENT_TO_STAGE, NON_TEAM_ROLES
    from stage_rules import format_stage_window, stored_stages
except ImportError:  # run as backend.server from the repo root
    from backend.common import now_iso
    from backend.db_client import db
    from backend.domain_constants import ANY_MANAGER_APPROVAL_TYPES, DEPARTMENT_TO_STAGE, NON_TEAM_ROLES
    from backend.stage_rules import format_stage_window, stored_stages

if TYPE_CHECKING:  # only for the type hint below
    from server import User  # noqa: F401

logger = logging.getLogger("server")  # same log name as before the move


# ---------------- Push (Firebase Cloud Messaging) ----------------
_firebase_app = None
_firebase_init_attempted = False
_firebase_init_lock = threading.Lock()
_background_tasks: set = set()


def _fire_and_forget(coro):
    """Run a coroutine without blocking the request. The set keeps a strong
    reference so the task isn't garbage-collected mid-flight."""
    task = asyncio.create_task(coro)
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


# One lock per key, kept only while somebody holds or waits on it. Used to make
# "check whether it already exists, then insert" atomic for requests that land
# on this server at the same moment (a double click on Create, a retried upload).
# It cannot see a second server instance; the checks it guards also read the
# database, so a request that arrives after the first one finished still sees it.
_keyed_locks: "weakref.WeakValueDictionary[str, asyncio.Lock]" = weakref.WeakValueDictionary()


def _keyed_lock(key: str) -> asyncio.Lock:
    lock = _keyed_locks.get(key)
    if lock is None:
        lock = asyncio.Lock()
        _keyed_locks[key] = lock
    return lock


def _get_firebase_app():
    """Lazily initialise firebase-admin from the service-account key, given
    either as the FIREBASE_SERVICE_ACCOUNT_JSON env var (full JSON contents)
    or as a secret file at /etc/secrets/firebase-service-account.json.
    Returns None when neither is present, which simply disables push.

    Importing firebase_admin costs ~2s of CPU, so callers must run this in a
    worker thread (asyncio.to_thread) - never directly on the event loop."""
    global _firebase_app, _firebase_init_attempted
    with _firebase_init_lock:
        if _firebase_init_attempted:
            return _firebase_app
        _firebase_init_attempted = True

        raw = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if not raw:
            # Alternative: a Render "Secret File" (mounted under /etc/secrets/).
            key_path = os.environ.get(
                "FIREBASE_SERVICE_ACCOUNT_FILE",
                "/etc/secrets/firebase-service-account.json",
            )
            if os.path.isfile(key_path):
                raw = Path(key_path).read_text(encoding="utf-8")
        if not raw:
            logger.info(
                "No Firebase service account (FIREBASE_SERVICE_ACCOUNT_JSON or "
                "/etc/secrets/firebase-service-account.json); push notifications disabled"
            )
            return None

        try:
            import firebase_admin
            from firebase_admin import credentials
            from firebase_admin import messaging  # noqa: F401  (warm the import)

            _firebase_app = firebase_admin.initialize_app(
                credentials.Certificate(json.loads(raw))
            )
        except Exception:
            logger.exception("Could not initialise Firebase Admin; push notifications disabled")
            _firebase_app = None
        return _firebase_app


MAX_PUSHES_PER_USER_BATCH = 3


def _push_link(notification: dict, is_admin: bool, is_approver: bool = False) -> str:
    """Where clicking the push should take this recipient."""
    action_type = notification.get("action_type")
    if (
        notification.get("type") == "delayed_deadline"
        and notification.get("deliverable_id")
        and (is_admin or is_approver)
    ):
        link = f"/approvals?deliverable={notification['deliverable_id']}&fallback=worksheet"
        if notification.get("deliverable_name"):
            link += "&name=" + quote(str(notification["deliverable_name"]))
        return link
    if action_type == "open_approvals":
        if notification.get("deliverable_id"):
            return f"/approvals?deliverable={notification['deliverable_id']}"
        return "/approvals"
    if action_type in ("open_worksheet", "add_work_row"):
        return "/"
    if action_type == "add_deliverable" and notification.get("project_id"):
        return f"/projects/{notification['project_id']}"
    if notification.get("project_id") and is_admin:
        return f"/projects/{notification['project_id']}"
    return "/"


async def _send_push_for_notifications(notifications: list[dict]):
    """Send one FCM web-push per (notification, registered browser). Never
    raises: a push failure must not affect the request that created the
    in-app notification."""
    try:
        firebase_app = await asyncio.to_thread(_get_firebase_app)
        if not firebase_app or not notifications:
            return

        user_ids = list({n["user_id"] for n in notifications})
        token_docs = await db.push_tokens.find(
            {"user_id": {"$in": user_ids}},
            {"_id": 0, "token": 1, "user_id": 1},
        ).to_list(5000)
        if not token_docs:
            logger.info("Push skipped: no browsers registered for %d user(s)", len(user_ids))
            return

        tokens_by_user: dict[str, list[str]] = {}
        for doc in token_docs:
            tokens_by_user.setdefault(doc["user_id"], []).append(doc["token"])

        # Only admins can open project detail pages, so only they get a
        # project deep link; everyone else lands on the page they can use.
        admin_ids = {
            u["id"]
            for u in await db.users.find(
                {"id": {"$in": list(tokens_by_user)}, "role": "admin"},
                {"_id": 0, "id": 1},
            ).to_list(5000)
        }
        manager_ids = {
            u["id"]
            for u in await db.users.find(
                {"id": {"$in": list(tokens_by_user)}, "role": "manager"},
                {"_id": 0, "id": 1},
            ).to_list(5000)
        }

        notifications_by_user: dict[str, list[dict]] = {}
        for notification in notifications:
            notifications_by_user.setdefault(notification["user_id"], []).append(notification)

        from firebase_admin import messaging

        # Data-only messages: the service worker builds the visible
        # notification, so title/body/link all travel in `data` (strings only).
        messages = []
        for user_id, user_notifications in notifications_by_user.items():
            user_tokens = tokens_by_user.get(user_id)
            if not user_tokens:
                logger.info("Push skipped: no browser registered for user %s", user_id)
                continue

            if len(user_notifications) > MAX_PUSHES_PER_USER_BATCH:
                # A backlog (e.g. several approvals crossing the reminder
                # threshold at once) becomes one push instead of a pile.
                payloads = [{
                    "title": f"{len(user_notifications)} new notifications",
                    "body": "Open PMT to review them.",
                    "notification_id": "",
                    "type": "summary",
                    "link": "/",
                }]
            else:
                payloads = [
                    {
                        "title": str(n.get("title") or "TheFinpedia PMT"),
                        "body": str(n.get("message") or ""),
                        "notification_id": str(n.get("id") or ""),
                        "type": str(n.get("type") or ""),
                        "link": _push_link(n, is_admin=user_id in admin_ids, is_approver=user_id in manager_ids),
                    }
                    for n in user_notifications
                ]

            for data in payloads:
                for token in user_tokens:
                    messages.append(
                        messaging.Message(
                            token=token,
                            data=data,
                            webpush=messaging.WebpushConfig(
                                headers={"TTL": "86400", "Urgency": "high"}
                            ),
                        )
                    )

        dead_tokens: list[str] = []
        sent = failed = 0
        for start in range(0, len(messages), 500):  # FCM batch limit
            chunk = messages[start:start + 500]
            response = await asyncio.to_thread(
                messaging.send_each, chunk, app=firebase_app
            )
            for message, result in zip(chunk, response.responses):
                if result.success:
                    sent += 1
                    continue
                failed += 1
                logger.warning(
                    "Push to browser %s... rejected by FCM: %s: %s",
                    message.token[:10],
                    type(result.exception).__name__,
                    result.exception,
                )
                if isinstance(
                    result.exception,
                    (messaging.UnregisteredError, messaging.SenderIdMismatchError),
                ):
                    dead_tokens.append(message.token)

        if messages:
            logger.info("Push notifications: %d accepted by FCM, %d failed", sent, failed)

        if dead_tokens:
            await db.push_tokens.delete_many({"token": {"$in": dead_tokens}})
    except Exception:
        logger.exception("Push notification send failed")


# ---------------- Notifications ----------------
async def _production_users_for_stages(
    stages: List[str], roles: Optional[List[str]] = None
) -> list[dict]:
    departments = [
        department
        for department, stage in DEPARTMENT_TO_STAGE.items()
        if stage in stages
    ]

    if not departments:
        return []

    query: dict = {
        "active": {"$ne": False},
        "department": {"$in": departments},
    }
    if roles:
        query["role"] = {"$in": roles}

    return await db.users.find(
        query,
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


# Approval notices ("<stage> approval ready", "New deliverable added ... ready
# for <stage>") are only something a manager can act on: Approvals actions are
# manager-only. Team members get none of them, are never sent them, and never
# see ones that were stored before this rule (see list_notifications and
# migrate_manager_only_approval_notifications).
_APPROVAL_NOTICE_QUERY = {
    "$or": [
        {"type": "stage_handoff"},
        {"type": "new_project", "action_type": "add_work_row"},
    ]
}


async def _admin_users() -> list[dict]:
    """Recipients for notifications that only an admin can act on: creating
    deliverables and editing project status/timeline both require the admin
    role, so notifying production staff about them left those recipients
    with nothing they could actually do."""
    return await db.users.find(
        {"active": {"$ne": False}, "role": "admin"},
        {"_id": 0, "id": 1, "name": 1, "department": 1},
    ).to_list(1000)


# (user_id, dedupe_key) pairs this process has already written. The overdue scan
# rebuilds the SAME notifications on every run; without this, every one of them
# (thousands: overdue deliverables x recipients) is re-sent to MongoDB as an
# upsert that matches and changes nothing - a steady stream of outbound
# bandwidth. Only used by the overdue scan (skip_known=True). Worst case after a
# restart is one full send, then only genuinely new notices go out.
_known_notification_keys: set = set()
_KNOWN_NOTIFICATION_KEYS_MAX = 200_000


async def _upsert_notifications_batch(notifications: list[dict], skip_known: bool = False):
    """Write many notifications in a single round trip instead of one
    update_one() per notification. Each op is an independent upsert keyed
    on (user_id, dedupe_key), so ordered=False lets the rest of the batch
    succeed even if one entry races with a concurrent insert."""
    if not notifications:
        return

    if skip_known:
        notifications = [
            n for n in notifications
            if (n.get("user_id"), n.get("dedupe_key")) not in _known_notification_keys
        ]
        if not notifications:
            return

    ops = []
    for notification in notifications:
        dedupe_key = notification.get("dedupe_key")
        if not dedupe_key:
            dedupe_key = str(uuid.uuid4())
            notification["dedupe_key"] = dedupe_key

        ops.append(
            UpdateOne(
                {
                    "user_id": notification["user_id"],
                    "dedupe_key": dedupe_key,
                },
                {"$setOnInsert": notification},
                upsert=True,
            )
        )

    result = await db.notifications.bulk_write(ops, ordered=False)

    if skip_known:
        # Every op either inserted or matched an existing row, so all of them
        # exist now and need not be sent again.
        if len(_known_notification_keys) > _KNOWN_NOTIFICATION_KEYS_MAX:
            _known_notification_keys.clear()
        _known_notification_keys.update(
            (n["user_id"], n["dedupe_key"]) for n in notifications
        )

    # Push only the rows that were actually inserted. Upserts that matched an
    # existing (user_id, dedupe_key) are re-runs of a notification the user
    # already has, e.g. the periodic overdue scan.
    created = [notifications[index] for index in (result.upserted_ids or {})]
    if created:
        _fire_and_forget(_send_push_for_notifications(created))


async def _upsert_notification(notification: dict):
    await _upsert_notifications_batch([notification])


async def _notify_admins_deliverable_missing(reporter: "User", item: dict):
    """A user chose "Not available" in the worksheet's Deliverable dropdown:
    tell every admin to check the deliverables under that client in that
    project and add the missing one. Never raises - the worksheet save that
    triggered it must not fail because a notification could not be written.

    One notice per (project, admin): a second "Not available" on the same
    project while the first is still pending would only be noise. Once the
    admin has added deliverables the notice is marked actioned (see
    _resolve_deliverable_missing_notifications), so the next "Not available"
    on that project replaces it with a fresh, unread one."""
    try:
        project_id = item.get("project_id")
        if not project_id:
            return

        project = await db.projects.find_one(
            {"id": project_id}, {"_id": 0, "name": 1, "client_id": 1}
        )
        if not project:
            return

        client_id = project.get("client_id") or item.get("client_id")
        client_doc = (
            await db.clients.find_one({"id": client_id}, {"_id": 0, "name": 1})
            if client_id
            else None
        )
        client_name = (client_doc or {}).get("name", "")
        project_name = project.get("name", "the project")

        admins = await _admin_users()
        if not admins:
            return

        dedupe_key = f"deliverable-missing:{project_id}"

        # An earlier notice the admin already actioned must not block a new one.
        await db.notifications.delete_many(
            {"dedupe_key": dedupe_key, "actioned_at": {"$ne": None}}
        )

        reporter_name = getattr(reporter, "name", None) or "A team member"
        where = f"{project_name} (Client: {client_name})" if client_name else project_name
        message = (
            f"{reporter_name} selected 'Not available' as the deliverable for {where}. "
            + (
                f"Please check all deliverables under {client_name} in this project and add the missing one."
                if client_name
                else "Please check all deliverables in this project and add the missing one."
            )
        )

        ts = now_iso()
        await _upsert_notifications_batch([
            {
                "id": str(uuid.uuid4()),
                "user_id": admin["id"],
                "type": "deliverable_missing",
                "title": "Deliverable not available",
                "message": message,
                "project_id": project_id,
                "deliverable_id": None,
                "client_id": client_id,
                "stage": item.get("stage"),
                "action_type": "add_deliverable",
                "created_at": ts,
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": dedupe_key,
            }
            for admin in admins
        ])
    except Exception:
        logger.exception("Could not create the deliverable-missing notification")


async def _resolve_deliverable_missing_notifications(project_id: Optional[str]):
    """Deliverables were just added to this project, so any pending
    'Not available' notice for it has been dealt with: drop the Add
    deliverable button and mark it read. Never raises."""
    if not project_id:
        return
    try:
        ts = now_iso()
        pending = {
            "type": "deliverable_missing",
            "project_id": project_id,
            "actioned_at": None,
        }
        await db.notifications.update_many({**pending, "read_at": None}, {"$set": {"read_at": ts}})
        await db.notifications.update_many(pending, {"$set": {"actioned_at": ts}})
    except Exception:
        logger.exception("Could not resolve the deliverable-missing notifications")


async def _notify_new_project(
    project: dict,
    deliverables: list[dict],
    title: str = "New project added",
    client_name: Optional[str] = None,
):
    """Create one notification per project/deliverable/stage/user.

    `title` is only used for the per-deliverable notices sent to production
    staff; pass a different one when deliverables are added to an existing
    project. Callers that already loaded the client can pass `client_name`
    to skip the lookup."""
    if client_name is None:
        client_doc = await db.clients.find_one(
            {"id": project.get("client_id")},
            {"_id": 0, "name": 1},
        )
        client_name = client_doc.get("name", "") if client_doc else ""

    pending_notifications: list[dict] = []

    if deliverables:
        await _resolve_deliverable_missing_notifications(project.get("id"))

    if not deliverables:
        # No deliverables yet means there's nothing for production staff to
        # act on — only an admin can add deliverables to a project, so only
        # admins are notified here.
        recipients = await _admin_users()
        for recipient in recipients:
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "new_project",
                "title": "New project added",
                "message": (
                    f'{project.get("name", "Project")} has been created.'
                    + (f' Client: {client_name}.' if client_name else "")
                    + " Add deliverables when the production plan is ready."
                ),
                "project_id": project.get("id"),
                "deliverable_id": None,
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": None,
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'new-project:{project.get("id")}:{recipient["id"]}',
            })
        await _upsert_notifications_batch(pending_notifications)
        return

    # One users query for the whole batch (it used to be one per deliverable),
    # then each deliverable's recipients are picked from it in memory.
    all_stages = {
        stage
        for deliverable in deliverables
        for stage in stored_stages(deliverable.get("required_stages"))
    }
    # Managers only: the per-deliverable "ready for <stage>" notice is an
    # approval notice, and team members do not act on approvals.
    production_users = await _production_users_for_stages(
        list(all_stages), roles=["manager"]
    )

    for deliverable in deliverables:
        if deliverable.get("stage_status") == "Completed":
            # Already fully done when created (e.g. imported historical data
            # via the "Finish" status) - there is nothing left for any team
            # to do on it, so no "ready for X" notice goes out for it.
            continue

        stages = stored_stages(deliverable.get("required_stages"))
        schedule = deliverable.get("stage_schedule") or {}
        recipients = [
            user
            for user in production_users
            if DEPARTMENT_TO_STAGE.get(user.get("department")) in stages
        ]

        for recipient in recipients:
            stage = DEPARTMENT_TO_STAGE.get(recipient.get("department"), stages[0])
            window_text = format_stage_window(schedule.get(stage))
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "new_project",
                "title": title,
                "message": (
                    f'{project.get("name", "Project")} · '
                    f'{deliverable.get("name", "Deliverable")} '
                    f'is ready for {stage}'
                    + (f' ({window_text})' if window_text else "")
                    + "."
                    + (f' Client: {client_name}.' if client_name else "")
                ),
                "project_id": project.get("id"),
                "deliverable_id": deliverable.get("id"),
                "client_id": project.get("client_id"),
                "stage": stage,
                "action_type": "add_work_row",
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'new-project:{project.get("id")}:{deliverable.get("id")}:{recipient["id"]}',
            })

    await _upsert_notifications_batch(pending_notifications)


def _scan_interval_from_env() -> timedelta:
    try:
        minutes = int(os.getenv("NOTIFICATION_SCAN_INTERVAL_MINUTES", "360"))
    except ValueError:
        minutes = 360
    return timedelta(minutes=max(1, minutes))


# How often the overdue-deadline and reminder scans may run. Both read every
# user, project and deliverable, and any open tab's bell poll can trigger them,
# so they used to cost the API a full scan every minute for notices almost nobody
# watches live. New notices still reach people at once by push; this only sets
# how often the scans look for newly overdue / stuck items. Override with the
# NOTIFICATION_SCAN_INTERVAL_MINUTES environment variable (default 360 = 6h).
NOTIFICATION_SCAN_INTERVAL = _scan_interval_from_env()

_last_overdue_notification_check: Optional[datetime] = None


async def _ensure_overdue_notifications():
    """Materialize overdue deadline notifications without requiring a scheduler.

    Rewritten to avoid N+1 queries: the original version issued one
    deliverables lookup per overdue project, one project lookup per overdue
    deliverable, one users lookup per project/deliverable, and one DB round
    trip per individual notification. On any account with more than a
    handful of overdue items, that turned every ~60s check into dozens or
    hundreds of sequential awaits — which is what made the bell noticeably
    slow to open on the request that happened to land outside the throttle
    window. This version does a fixed, small number of batched queries plus
    a single bulk write, regardless of how many projects/deliverables are
    overdue.
    """
    global _last_overdue_notification_check

    check_now = datetime.now(timezone.utc)
    if (
        _last_overdue_notification_check
        and check_now - _last_overdue_notification_check < NOTIFICATION_SCAN_INTERVAL
    ):
        return

    _last_overdue_notification_check = check_now
    today = check_now.date().isoformat()

    # Load every active user once and group by department in memory, instead
    # of re-querying db.users for every overdue project/deliverable below.
    all_users = await db.users.find(
        {"active": {"$ne": False}},
        {"_id": 0, "id": 1, "name": 1, "department": 1, "role": 1},
    ).to_list(1000)

    users_by_department: dict = {}
    for user in all_users:
        users_by_department.setdefault(user.get("department"), []).append(user)

    admin_users = [user for user in all_users if user.get("role") == "admin"]

    def recipients_for_stages(stages: List[str]) -> list[dict]:
        departments = [
            department
            for department, stage in DEPARTMENT_TO_STAGE.items()
            if stage in stages
        ]
        recipients = []
        seen_ids = set()
        for department in departments:
            for user in users_by_department.get(department, []):
                if user["id"] not in seen_ids:
                    seen_ids.add(user["id"])
                    recipients.append(user)
        return recipients

    pending_notifications: list[dict] = []

    projects = await db.projects.find(
        {
            "end_date": {"$lt": today},
            "status": {"$nin": ["Completed", "Ready for Invoice", "Raised Invoice", "Scrapped"]},
        },
        {"_id": 0},
    ).to_list(5000)

    # Project-level timeline health is an admin concern — only an admin can
    # change a project's status or dates (PATCH /projects/{id} requires
    # require_admin), so production staff had no way to act on these.
    for project in projects:
        for recipient in admin_users:
            pending_notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient["id"],
                "type": "delayed_deadline",
                "title": "Project deadline delayed",
                "message": (
                    f'{project.get("name", "Project")} was due on '
                    f'{project.get("end_date", "")} and is still {project.get("status", "active").lower()}. '
                    "Please review the project timeline."
                ),
                "project_id": project.get("id"),
                "deliverable_id": None,
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": None,
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f'project-overdue:{project.get("id")}:{project.get("end_date")}:{recipient["id"]}',
            })

    # Deliverables with a per-stage schedule (stage_schedule) are checked
    # against the CURRENT stage's own end date, not the deliverable's overall
    # end_dt - the overall end_dt is the LATEST of every stage's end, so a
    # deliverable whose Content window already closed can still have a
    # future overall end_dt (Design/Animate finish later) and would never
    # show up if only the overall date were checked here.
    legacy_overdue = await db.deliverables.find(
        {
            "end_dt": {"$lt": today},
            "stage_status": {"$nin": ["Completed", "Closed"]},   # Closed = legacy finished import
            "$or": [{"stage_schedule": {"$exists": False}}, {"stage_schedule": {}}],
        },
        {"_id": 0},
    ).to_list(5000)

    scheduled_candidates = await db.deliverables.find(
        {
            "stage_status": {"$nin": ["Completed", "Closed"]},   # Closed = legacy finished import
            "stage_schedule": {"$nin": [None, {}]},
        },
        {"_id": 0},
    ).to_list(5000)

    stage_overdue = [
        d
        for d in scheduled_candidates
        if (d.get("stage_schedule") or {}).get(d.get("current_stage"), {}).get("end_dt", today) < today
    ]

    overdue_deliverables = legacy_overdue + stage_overdue

    if overdue_deliverables:
        parent_ids = list({
            d.get("project_id") for d in overdue_deliverables if d.get("project_id")
        })

        # One batched query for all the parent projects, instead of one
        # find_one() per overdue deliverable.
        parent_projects = await db.projects.find(
            {"id": {"$in": parent_ids}},
            {"_id": 0, "id": 1, "name": 1, "client_id": 1, "status": 1},
        ).to_list(5000)
        projects_by_id = {p["id"]: p for p in parent_projects}

        for deliverable in overdue_deliverables:
            project = projects_by_id.get(deliverable.get("project_id"))
            if not project:
                continue

            schedule = deliverable.get("stage_schedule") or {}
            required = stored_stages(deliverable.get("required_stages"))
            if schedule:
                # Only the team currently holding the deliverable is late -
                # a downstream team's window hasn't opened yet, so they
                # aren't the ones missing a deadline.
                current_stage = deliverable.get("current_stage")
                target_stages = [current_stage] if current_stage in required else []
                due_date = (schedule.get(current_stage) or {}).get("end_dt", "")
            else:
                target_stages = required
                due_date = deliverable.get("end_dt", "")

            recipients = recipients_for_stages(target_stages)

            for recipient in recipients:
                stage = DEPARTMENT_TO_STAGE.get(recipient.get("department"))
                if stage not in target_stages:
                    continue

                pending_notifications.append({
                    "id": str(uuid.uuid4()),
                    "user_id": recipient["id"],
                    "type": "delayed_deadline",
                    "title": "Deliverable deadline delayed",
                    "message": (
                        f'{deliverable.get("name", "Deliverable")} in '
                        f'{project.get("name", "Project")} '
                        + (f'({stage} stage) ' if schedule else "")
                        + f'was due on {due_date} and is not completed.'
                    ),
                    "project_id": deliverable.get("project_id"),
                    "deliverable_id": deliverable.get("id"),
                    "client_id": project.get("client_id"),
                    "stage": stage,
                    "action_type": None,
                    "created_at": now_iso(),
                    "read_at": None,
                    "actioned_at": None,
                    "dedupe_key": f'deliverable-overdue:{deliverable.get("id")}:{stage}:{due_date}:{recipient["id"]}',
                })

    await _upsert_notifications_batch(pending_notifications, skip_known=True)


# ---------------- Reminder notifications ----------------
# Rule-based reminders, materialised lazily (same no-scheduler approach as
# _ensure_overdue_notifications): worksheet inactivity and stuck approvals.
try:
    REMINDER_TIMEZONE = ZoneInfo("Asia/Kolkata")
except ZoneInfoNotFoundError:  # tz database missing (e.g. Windows without tzdata)
    REMINDER_TIMEZONE = timezone(timedelta(hours=5, minutes=30))  # IST has no DST
# Inactivity reminders go out on/after this local hour of the next working day,
# so nobody is pinged at midnight just because the first poll of the day landed.
INACTIVITY_REMINDER_HOUR = 10
APPROVAL_STUCK_DAYS = 2
REMINDER_CHECK_INTERVAL = NOTIFICATION_SCAN_INTERVAL

APPROVAL_TYPE_LABELS = {
    "MANAGER": "manager",
    "LEADERSHIP": "leadership",
    "CLIENT_SPOC": "client SPOC",
    "COMPLIANCE": "compliance",
}

_last_reminder_check: Optional[datetime] = None
_inactivity_processed_day: Optional[str] = None


def _parse_utc(value) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _previous_working_day(day):
    """Previous Monday-Friday before `day` (Monday -> the prior Friday)."""
    day = day - timedelta(days=1)
    while day.weekday() >= 5:
        day = day - timedelta(days=1)
    return day


def _local_day_window_utc(day) -> dict:
    """Mongo range filter covering one calendar day in REMINDER_TIMEZONE,
    expressed against the UTC ISO timestamps PMT stores."""
    start = datetime(day.year, day.month, day.day, tzinfo=REMINDER_TIMEZONE)
    end = start + timedelta(days=1)
    return {
        "$gte": start.astimezone(timezone.utc).isoformat(),
        "$lt": end.astimezone(timezone.utc).isoformat(),
    }


async def _worksheet_inactivity_notifications(local_now: datetime):
    """Users who did nothing on the Work Sheet on the previous working day get
    one reminder on the next working day.

    Returns (notifications, day_iso); day_iso is None when the rule didn't run.

    "Activity" means any of: a row created or edited (created_at/updated_at)
    or dated (work_date) on that day, a row they review/manage that was
    touched, or a status/stage change they logged. Admins are excluded (the
    Work Sheet is view-only for them), as are users who have never been on a
    work row.
    """
    if local_now.weekday() >= 5 or local_now.hour < INACTIVITY_REMINDER_HOUR:
        return [], None

    target_day = _previous_working_day(local_now.date())
    day_iso = target_day.isoformat()
    if day_iso == _inactivity_processed_day:
        return [], day_iso

    window = _local_day_window_utc(target_day)

    users = await db.users.find(
        {"active": {"$ne": False}, "role": {"$nin": NON_TEAM_ROLES}},
        {"_id": 0, "id": 1},
    ).to_list(5000)

    involved: set = set()
    for field in ("creator_id", "reviewer_id", "manager_id"):
        involved.update(v for v in await db.work_items.distinct(field) if v)

    active: set = set()
    active.update(
        v for v in await db.work_items.distinct(
            "creator_id",
            {"$or": [
                {"work_date": day_iso},
                {"created_at": window},
                {"updated_at": window},
            ]},
        ) if v
    )
    for field in ("reviewer_id", "manager_id"):
        active.update(
            v for v in await db.work_items.distinct(field, {"updated_at": window}) if v
        )
    active.update(
        v for v in await db.work_item_activity_log.distinct(
            "changed_by", {"changed_at": window}
        ) if v
    )

    notifications = []
    for user in users:
        user_id = user["id"]
        if user_id not in involved or user_id in active:
            continue
        notifications.append({
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "type": "worksheet_inactivity",
            "title": "Update your work sheet",
            "message": (
                f"You had no work sheet activity on {target_day.strftime('%A, %d %b')}. "
                "Please add or update your entries."
            ),
            "project_id": None,
            "deliverable_id": None,
            "client_id": None,
            "stage": None,
            "action_type": "open_worksheet",
            "created_at": now_iso(),
            "read_at": None,
            "actioned_at": None,
            "dedupe_key": f"worksheet-inactivity:{user_id}:{day_iso}",
        })

    return notifications, day_iso


async def _stuck_approval_notifications(now: datetime) -> list[dict]:
    """One reminder per pending approval that has waited APPROVAL_STUCK_DAYS+,
    sent to whoever can actually act on it (mirrors _approval_item_can_act):
    the assignee; else stage managers for MANAGER, the Administration
    department for COMPLIANCE; admins when nobody else can act. The dedupe key
    includes requested_at, so a resubmitted approval is reminded afresh."""
    cutoff = now - timedelta(days=APPROVAL_STUCK_DAYS)

    items = await db.approval_items.find(
        {"status": "PENDING", "hidden": {"$ne": True}},
        {"_id": 0},
    ).to_list(5000)

    stuck = []
    for item in items:
        requested_at = _parse_utc(
            item.get("requested_at") or item.get("updated_at") or item.get("created_at")
        )
        if requested_at and requested_at <= cutoff:
            stuck.append((item, requested_at))
    if not stuck:
        return []

    deliverable_ids = list({i["deliverable_id"] for i, _ in stuck if i.get("deliverable_id")})
    deliverables = {
        d["id"]: d
        for d in await db.deliverables.find(
            {"id": {"$in": deliverable_ids}},
            {"_id": 0, "id": 1, "name": 1, "project_id": 1, "current_stage": 1},
        ).to_list(5000)
    }
    project_ids = list({d.get("project_id") for d in deliverables.values() if d.get("project_id")})
    projects = {
        p["id"]: p
        for p in await db.projects.find(
            {"id": {"$in": project_ids}},
            {"_id": 0, "id": 1, "name": 1, "client_id": 1},
        ).to_list(5000)
    }
    users = await db.users.find(
        {"active": {"$ne": False}},
        {"_id": 0, "id": 1, "role": 1, "department": 1},
    ).to_list(5000)
    active_ids = {u["id"] for u in users}
    admin_ids = [u["id"] for u in users if u.get("role") == "admin"]

    notifications = []
    for item, requested_at in stuck:
        deliverable = deliverables.get(item.get("deliverable_id"))
        if not deliverable:
            continue  # orphaned approval row

        approval_type = item.get("approval_type")
        if item.get("assigned_to"):
            recipients = [item["assigned_to"]] if item["assigned_to"] in active_ids else []
        elif approval_type == "MANAGER":
            recipients = [
                u["id"] for u in users
                if u.get("role") == "manager"
                and DEPARTMENT_TO_STAGE.get(u.get("department")) == deliverable.get("current_stage")
            ]
        elif approval_type in ANY_MANAGER_APPROVAL_TYPES:
            recipients = [u["id"] for u in users if u.get("role") == "manager"]
        else:
            recipients = []
        if not recipients:
            recipients = admin_ids

        project = projects.get(deliverable.get("project_id")) or {}
        days_waiting = max(APPROVAL_STUCK_DAYS, (now - requested_at).days)
        label = APPROVAL_TYPE_LABELS.get(approval_type, "")
        subject = deliverable.get("name", "Deliverable")
        if project.get("name"):
            subject = f"{subject} · {project['name']}"

        for recipient_id in set(recipients):
            notifications.append({
                "id": str(uuid.uuid4()),
                "user_id": recipient_id,
                "type": "approval_stuck",
                "title": "Approval waiting for action",
                "message": (
                    f"{subject} has been waiting for {label + ' ' if label else ''}"
                    f"approval for {days_waiting} days."
                ),
                "project_id": deliverable.get("project_id"),
                "deliverable_id": deliverable.get("id"),
                "approval_item_id": item.get("id"),
                "client_id": project.get("client_id"),
                "stage": None,
                "action_type": "open_approvals",
                "created_at": now_iso(),
                "read_at": None,
                "actioned_at": None,
                "dedupe_key": f"approval-stuck:{item.get('id')}:{requested_at.isoformat()}:{recipient_id}",
            })

    return notifications


async def _ensure_reminder_notifications():
    """Run the reminder rules at most once per REMINDER_CHECK_INTERVAL. Never
    raises: a reminder problem must not break the notifications endpoint."""
    global _last_reminder_check, _inactivity_processed_day

    now = datetime.now(timezone.utc)
    if _last_reminder_check and now - _last_reminder_check < REMINDER_CHECK_INTERVAL:
        return
    _last_reminder_check = now

    try:
        pending = await _stuck_approval_notifications(now)

        inactivity, inactivity_day = await _worksheet_inactivity_notifications(
            now.astimezone(REMINDER_TIMEZONE)
        )
        pending.extend(inactivity)

        await _upsert_notifications_batch(pending)

        if inactivity_day:
            _inactivity_processed_day = inactivity_day
    except Exception:
        logger.exception("Reminder notification check failed")
