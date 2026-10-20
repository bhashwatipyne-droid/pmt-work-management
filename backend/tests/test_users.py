"""Team member routes (users.py), on an in-memory database."""
import asyncio
import os
import sys

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "users_test")
os.environ.setdefault("JWT_SECRET", "users-test-secret-0123456789abcdef")

from users import create_users_router  # noqa: E402


def _run(coro):
    loop = asyncio.new_event_loop()  # never touch the shared default loop
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@pytest.fixture()
def env():
    import server  # imported late so it cannot disturb tests that patch it while collecting

    db = AsyncMongoMockClient()["t"]
    dropped = []

    async def get_acting_user(request: Request):
        if request.headers.get("x-role") is None:
            raise HTTPException(status_code=401, detail="no")
        return type("U", (), {"id": "u1", "role": request.headers["x-role"]})()

    async def require_admin(request: Request):
        user = await get_acting_user(request)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="admin only")
        return user

    app = FastAPI()
    app.include_router(
        create_users_router(
            db, get_acting_user, require_admin, lambda p: "hash:" + p, lambda uid=None: dropped.append(uid),
            server.User, server.UserCreate, server.UserUpdate, server.ROLES, server.DEPARTMENTS,
        )
    )
    return TestClient(app), db, dropped


ADMIN = {"x-role": "admin"}
NEW = {"name": " Asha ", "username": " Asha ", "email": " A@X.com ", "password": "longenough", "role": "member", "department": "Design"}


def test_create_cleans_fields_hashes_password_and_hides_it(env):
    c, db, _ = env
    r = c.post("/users", json=NEW, headers=ADMIN)
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "asha" and body["email"] == "a@x.com" and body["name"] == "Asha"
    assert "password_hash" not in body and body["id"].startswith("member-")
    assert _run(db.users.find_one({"username": "asha"}))["password_hash"] == "hash:longenough"


@pytest.mark.parametrize(
    "change,status",
    [({"role": "boss"}, 400), ({"department": ""}, 400), ({"password": "short"}, 400), ({"username": " "}, 400)],
)
def test_create_rejects_bad_input(env, change, status):
    c, _, _ = env
    assert c.post("/users", json={**NEW, **change}, headers=ADMIN).status_code == status


def test_username_must_be_unique_and_only_admins_write(env):
    c, _, _ = env
    assert c.post("/users", json=NEW, headers=ADMIN).status_code == 200
    assert c.post("/users", json=NEW, headers=ADMIN).status_code == 400
    assert c.post("/users", json=NEW, headers={"x-role": "member"}).status_code == 403
    assert c.get("/users").status_code == 401
    assert len(c.get("/users", headers={"x-role": "member"}).json()) == 1


def test_update_edits_fields_keeps_blank_password_and_drops_cache(env):
    c, db, dropped = env
    uid = c.post("/users", json=NEW, headers=ADMIN).json()["id"]
    other = c.post("/users", json={**NEW, "username": "bo", "email": "b@x.com"}, headers=ADMIN).json()["id"]
    r = c.patch(f"/users/{uid}", json={"name": " Asha K ", "password": "", "department": "Content"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["name"] == "Asha K"
    assert _run(db.users.find_one({"id": uid}))["password_hash"] == "hash:longenough"
    assert dropped == [uid]
    c.patch(f"/users/{uid}", json={"password": "anotherlong"}, headers=ADMIN)
    assert _run(db.users.find_one({"id": uid}))["password_hash"] == "hash:anotherlong"
    assert c.patch(f"/users/{other}", json={"username": "ASHA"}, headers=ADMIN).status_code == 400
    assert c.patch("/users/none", json={"name": "x"}, headers=ADMIN).status_code == 404
    assert c.patch(f"/users/{uid}", json={"role": "boss"}, headers=ADMIN).status_code == 400
