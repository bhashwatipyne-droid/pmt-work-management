"""Clients and contact persons (clients.py), on an in-memory database."""
import os
import sys

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from mongomock_motor import AsyncMongoMockClient

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from clients import create_clients_router, validate_contact_phone  # noqa: E402


@pytest.fixture()
def env():
    db = AsyncMongoMockClient()["t"]
    logged = []

    async def get_acting_user(request: Request):
        if request.headers.get("x-role") is None:
            raise HTTPException(status_code=401, detail="no")
        return type("U", (), {"id": "u1", "role": request.headers["x-role"]})()

    async def require_admin(request: Request):
        user = await get_acting_user(request)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="admin only")
        return user

    async def log_activity(**kw):
        logged.append(kw)

    app = FastAPI()
    app.include_router(create_clients_router(db, get_acting_user, require_admin, log_activity))
    return TestClient(app), db, logged


ADMIN = {"x-role": "admin"}
MEMBER = {"x-role": "member"}


def test_anyone_logged_in_can_list_clients_sorted_by_name(env):
    c, _, _ = env
    for n in ("Zed", "Acme"):
        assert c.post("/clients", json={"name": n}, headers=ADMIN).status_code == 200
    r = c.get("/clients", headers=MEMBER)
    assert [x["name"] for x in r.json()] == ["Acme", "Zed"]
    assert c.get("/clients").status_code == 401


def test_only_admins_change_clients(env):
    c, _, _ = env
    assert c.post("/clients", json={"name": "A"}, headers=MEMBER).status_code == 403


def test_update_validates_status(env):
    c, _, _ = env
    cid = c.post("/clients", json={"name": "A"}, headers=ADMIN).json()["id"]
    assert c.patch(f"/clients/{cid}", json={"status": "Bogus"}, headers=ADMIN).status_code == 400
    r = c.patch(f"/clients/{cid}", json={"status": "Inactive"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "Inactive"
    assert c.patch("/clients/nope", json={"name": "x"}, headers=ADMIN).status_code == 404


def test_delete_is_refused_with_an_active_project_then_detaches_finished_ones(env):
    c, db, logged = env
    cid = c.post("/clients", json={"name": "A"}, headers=ADMIN).json()["id"]
    import asyncio

    asyncio.run(db.projects.insert_one({"id": "p1", "client_id": cid, "status": "Active", "poc_id": "x"}))
    assert c.delete(f"/clients/{cid}", headers=ADMIN).status_code == 400
    asyncio.run(db.projects.update_one({"id": "p1"}, {"$set": {"status": "Completed"}}))
    assert c.delete(f"/clients/{cid}", headers=ADMIN).json() == {"success": True}
    p = asyncio.run(db.projects.find_one({"id": "p1"}))
    assert p["client_id"] is None and p["poc_id"] is None
    assert logged and logged[0]["action"] == "CLIENT_DELETED"


def test_contact_lifecycle_and_phone_rules(env):
    c, db, _ = env
    cid = c.post("/clients", json={"name": "A"}, headers=ADMIN).json()["id"]
    assert c.post(f"/clients/{cid}/contacts", json={"name": " "}, headers=ADMIN).status_code == 400
    assert c.post(f"/clients/{cid}/contacts", json={"name": "Ann", "phone": "12"}, headers=ADMIN).status_code == 400
    contact = c.post(f"/clients/{cid}/contacts", json={"name": " Ann ", "phone": "+91 98765-43210"}, headers=ADMIN).json()
    assert contact["name"] == "Ann"
    r = c.patch(f"/clients/{cid}/contacts/{contact['id']}", json={"designation": " CFO "}, headers=ADMIN)
    assert r.json()["designation"] == "CFO"
    assert c.patch(f"/clients/{cid}/contacts/missing", json={"name": "x"}, headers=ADMIN).status_code == 404

    import asyncio

    asyncio.run(db.projects.insert_one({"id": "p1", "poc_id": contact["id"]}))
    assert c.delete(f"/clients/{cid}/contacts/{contact['id']}", headers=ADMIN).status_code == 400
    asyncio.run(db.projects.delete_one({"id": "p1"}))
    assert c.delete(f"/clients/{cid}/contacts/{contact['id']}", headers=ADMIN).status_code == 200
    assert asyncio.run(db.clients.find_one({"id": cid}))["contact_persons"] == []


def test_phone_validator():
    assert validate_contact_phone("") == ""
    assert validate_contact_phone(None) == ""
    assert validate_contact_phone(" (022) 1234-5678 ") == "(022) 1234-5678"
    with pytest.raises(HTTPException):
        validate_contact_phone("abc1234567")
