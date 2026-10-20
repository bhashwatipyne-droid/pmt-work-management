"""Login throttle, tokens, the acting-user lookup, role guards and activity log.
Moved out of server.py unchanged; server.py re-exports every name."""
import os  # noqa: F401
import random  # noqa: F401
import string  # noqa: F401
import time  # noqa: F401
import uuid  # noqa: F401
from datetime import datetime, timedelta, timezone  # noqa: F401
from typing import Optional  # noqa: F401

import bcrypt  # noqa: F401
import jwt  # noqa: F401
from fastapi import HTTPException, Request  # noqa: F401

try:
    from common import now_iso
    from constants import *  # noqa: F401,F403
    from db_client import db
    from domain_constants import DEPARTMENT_TO_STAGE
    from models import User
except ImportError:  # run as backend.server from the repo root
    from backend.common import now_iso
    from backend.constants import *  # noqa: F401,F403
    from backend.db_client import db
    from backend.domain_constants import DEPARTMENT_TO_STAGE
    from backend.models import User


# ---------------- Auth helpers ----------------
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_HOURS = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not hashed_password:
        return False
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(hours=ACCESS_TOKEN_HOURS)}
    return jwt.encode(payload, os.environ["JWT_SECRET"], algorithm=JWT_ALGORITHM)


# ---------------- Helpers ----------------
# Every authenticated request used to start with a users.find_one round trip to
# the database. Repeated polls and page loads from the same person now reuse the
# document for a short time. Any write to the users collection below drops the
# entry, so the only lag is for changes made by another server instance
# (bounded by the TTL).
_USER_CACHE_TTL_SECONDS = 30
_user_cache: dict = {}


def _invalidate_cached_user(user_id: Optional[str] = None) -> None:
    if user_id is None:
        _user_cache.clear()
    else:
        _user_cache.pop(user_id, None)


async def get_acting_user(request: Request) -> User:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, os.environ["JWT_SECRET"], algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired, please log in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    user_id = payload["sub"]
    cached = _user_cache.get(user_id)
    if cached and cached[0] > time.monotonic():
        doc = cached[1]
    else:
        doc = await db.users.find_one({"id": user_id}, {"_id": 0})
        if doc:
            _user_cache[user_id] = (time.monotonic() + _USER_CACHE_TTL_SECONDS, doc)
    if not doc:
        raise HTTPException(status_code=401, detail="User not found")
    if not doc.get("active", True):
        raise HTTPException(status_code=401, detail="Account deactivated")
    if doc.get("role") == "hr" and not request.url.path.startswith(HR_ALLOWED_PREFIXES):
        # HR works only in invoicing; keep every production endpoint closed to it.
        raise HTTPException(status_code=403, detail="HR accounts can only use invoicing")
    return User(**doc)


def _activity_doc(
    entity_id: str,
    action: str,
    changed_by: str,
    old_value=None,
    new_value=None,
    metadata=None,
    entity_field: str = "entity_id",
) -> dict:
    return {
        "id": str(uuid.uuid4()),
        entity_field: entity_id,
        "action": action,
        "old_value": old_value,
        "new_value": new_value,
        "changed_by": changed_by,
        "changed_at": now_iso(),
        "metadata": metadata or {},
    }


async def log_activity(
    collection_name: str,
    entity_id: str,
    action: str,
    changed_by: str,
    old_value=None,
    new_value=None,
    metadata=None,
    entity_field: str = "entity_id",
):
    activity = _activity_doc(
        entity_id,
        action,
        changed_by,
        old_value=old_value,
        new_value=new_value,
        metadata=metadata,
        entity_field=entity_field,
    )

    await db[collection_name].insert_one(activity)


def gen_project_code() -> str:
    return "proj" + "".join(random.choices(string.ascii_lowercase + string.digits, k=9))



async def require_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access only")
    return user


async def require_manager(request: Request) -> User:
    """Manager-only actions (approvals, efficiency capacity). Admins and members
    can open those screens read-only but cannot act."""
    user = await get_acting_user(request)
    if user.role != "manager":
        raise HTTPException(
            status_code=403,
            detail="Only managers can take this action"
        )
    return user


def _approvals_view_all(user: User) -> bool:
    """Admins and members see every pending approval. Admins can also act on
    them; members are read-only. Managers see the queue they can actually act
    on (see _approval_item_can_act)."""
    return user.role in ("admin", "member")


# Members of these departments only see approvals for deliverables currently
# in their own production stage (e.g. the Content team sees Content approvals
# only). Department -> stage.
MEMBER_APPROVAL_STAGE_SCOPE = {"Content": "Content"}


def _member_approval_stage(user: User) -> Optional[str]:
    """The only stage a member may see approvals for, or None if unscoped."""
    if user.role != "member":
        return None
    return MEMBER_APPROVAL_STAGE_SCOPE.get(user.department or "")


def _member_can_view_approval(user: User, deliverable: Optional[dict]) -> bool:
    stage = _member_approval_stage(user)
    if stage is None:
        return True
    return bool(deliverable) and deliverable.get("current_stage", "Content") == stage


async def require_approver(request: Request) -> User:
    """Approvals actions (approve, move, hide). Managers and admins
    may act; members stay read-only."""
    user = await get_acting_user(request)
    if user.role not in {"manager", "admin"}:
        raise HTTPException(
            status_code=403,
            detail="Only managers and admins can take this action"
        )
    return user


async def require_manager_or_admin(request: Request) -> User:
    user = await get_acting_user(request)
    if user.role not in {"admin", "manager"}:
        raise HTTPException(
            status_code=403,
            detail="Manager or admin access required"
        )
    return user



def can_user_create_stage(user: User, stage: str) -> bool:
    if user.role == "admin":
        return False

    user_stage = DEPARTMENT_TO_STAGE.get(user.department)

    # Managers and members can create rows only for their own department.
    return bool(user_stage and stage == user_stage)


async def get_user_department(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "department": 1})
    return doc.get("department") if doc else None


async def get_user_role(user_id: Optional[str]) -> Optional[str]:
    if not user_id:
        return None
    doc = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1})
    return doc.get("role") if doc else None
