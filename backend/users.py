"""Team members: list, add, edit (admin only for changes).

    GET   /users            any logged-in user
    POST  /users            admin: new login (role, department, password >= 8)
    PATCH /users/{id}       admin: edit; blank password keeps the old one
    DELETE /users/{id}      admin: remove someone who has left (deactivates the
                            login and hides them from Team; history is kept)

Moved out of server.py unchanged. The User models stay in server.py (every
module uses them) and are passed in with the other helpers.
"""
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable, List

from fastapi import APIRouter, HTTPException, Request


def create_users_router(
    db,
    get_acting_user: Callable[..., Awaitable],
    require_admin: Callable[..., Awaitable],
    hash_password: Callable[[str], str],
    invalidate_cached_user: Callable[..., None],
    user_model,
    user_create_model,
    user_update_model,
    roles: List[str],
    departments: List[str],
) -> APIRouter:
    User = user_model
    UserCreate = user_create_model
    UserUpdate = user_update_model
    ROLES = roles
    DEPARTMENTS = departments
    _invalidate_cached_user = invalidate_cached_user
    router = APIRouter()

    @router.get("/users", response_model=List[User])
    async def list_users(request: Request):
        await get_acting_user(request)
        return await db.users.find({}, {"_id": 0}).to_list(1000)


    @router.post("/users", response_model=User)
    async def create_user(payload: UserCreate, request: Request):
        await require_admin(request)
        if payload.role not in ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        if not payload.department or payload.department not in DEPARTMENTS:
            raise HTTPException(status_code=400, detail="Department required")

        username = payload.username.strip().lower()
        email = payload.email.strip().lower()

        if not username:
            raise HTTPException(status_code=400, detail="Username required")

        if not email:
            raise HTTPException(status_code=400, detail="Email required")

        if len(payload.password) < 8:
            raise HTTPException(
                status_code=400,
                detail="Password must be at least 8 characters",
            )

        existing_username = await db.users.find_one({"username": username})
        if existing_username:
            raise HTTPException(
                status_code=400,
                detail="Username already exists",
            )

        role_prefix = payload.role
        uid = f"{role_prefix}-{uuid.uuid4().hex[:6]}"
        doc = {
            "id": uid,
            "name": payload.name.strip(),
            "username": username,
            "email": email,
            "password_hash": hash_password(payload.password),
            "role": payload.role,
            "department": payload.department or "",
            "active": payload.active if payload.active is not None else True,
        }
        await db.users.insert_one(doc)
        return User(**doc)


    @router.patch("/users/{user_id}", response_model=User)
    async def update_user(
        user_id: str,
        payload: UserUpdate,
        request: Request
    ):
        await require_admin(request)

        existing = await db.users.find_one(
            {"id": user_id},
            {"_id": 0}
        )

        if not existing:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )

        update_fields = payload.model_dump(
            exclude_unset=True
        )

        # Username
        if "username" in update_fields:
            username = (
                update_fields["username"] or ""
            ).strip().lower()

            if not username:
                raise HTTPException(
                    status_code=400,
                    detail="Username required"
                )

            existing_username = await db.users.find_one(
                {
                    "username": username,
                    "id": {"$ne": user_id}
                }
            )

            if existing_username:
                raise HTTPException(
                    status_code=400,
                    detail="Username already exists"
                )

            update_fields["username"] = username

        # Email
        if "email" in update_fields:
            email = (
                update_fields["email"] or ""
            ).strip().lower()

            if not email:
                raise HTTPException(
                    status_code=400,
                    detail="Email required"
                )

            update_fields["email"] = email

        # Name
        if "name" in update_fields:
            name = (
                update_fields["name"] or ""
            ).strip()

            if not name:
                raise HTTPException(
                    status_code=400,
                    detail="Name required"
                )

            update_fields["name"] = name

        # Role
        if "role" in update_fields:
            if update_fields["role"] not in ROLES:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid role"
                )

        # Department
        if "department" in update_fields:
            if (
                not update_fields["department"]
                or update_fields["department"] not in DEPARTMENTS
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Department required"
                )

        # Password
        # Only change it when a new password was supplied.
        if "password" in update_fields:
            password = update_fields.pop("password")

            if password:
                if len(password) < 8:
                    raise HTTPException(
                        status_code=400,
                        detail="Password must be at least 8 characters"
                    )

                update_fields["password_hash"] = hash_password(
                    password
                )

        await db.users.update_one(
            {"id": user_id},
            {"$set": update_fields}
        )
        _invalidate_cached_user(user_id)

        updated = await db.users.find_one(
            {"id": user_id},
            {"_id": 0}
        )

        return User(**updated)

    @router.delete("/users/{user_id}")
    async def remove_user(user_id: str, request: Request):
        acting = await require_admin(request)
        existing = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "role": 1})
        if not existing:
            raise HTTPException(status_code=404, detail="User not found")
        if existing["id"] == getattr(acting, "id", None):
            raise HTTPException(status_code=400, detail="You cannot remove your own account")
        if existing.get("role") == "admin":
            raise HTTPException(status_code=400, detail="Admin accounts cannot be removed here")

        # Not a hard delete: their name is on old work items, approvals and
        # efficiency history, which would all turn into "Unknown".
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "active": False,
                "removed": True,
                "removed_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        _invalidate_cached_user(user_id)
        return {"ok": True, "id": user_id}

    return router
