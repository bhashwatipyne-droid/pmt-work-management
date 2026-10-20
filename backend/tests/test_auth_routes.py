"""Sign-in and account routes (auth_routes.py) on the real app and an in-memory database."""
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import env, run, server  # noqa: E402,F401

PASSWORD = "correct-horse-1"


@pytest.fixture()
def accounts(env):
    run(server.db.users.update_one(
        {"id": "member-km"},
        {"$set": {"username": "krishna", "password_hash": server.hash_password(PASSWORD), "email": "k@example.test"}},
    ))
    server._login_fails.clear()
    yield env
    server._login_fails.clear()


def client(env):
    c = env.as_user("member-km")
    c.headers.pop("Authorization", None)
    c.cookies.clear()
    return c


def login(env, password=PASSWORD, username="krishna"):
    return client(env).post("/api/auth/login", json={"login": username, "password": password})


def test_login_succeeds_with_the_right_password_and_returns_a_token(accounts):
    r = login(accounts)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == "member-km" and body["access_token"] and "password_hash" not in body


def test_wrong_password_and_unknown_user_are_refused_the_same_way(accounts):
    a = login(accounts, password="nope")
    b = login(accounts, username="ghost")
    assert a.status_code == b.status_code == 401
    assert a.json() == b.json()


def test_repeated_failures_lock_the_login_out_even_for_the_right_password(accounts):
    for _ in range(server.LOGIN_MAX_FAILS_PER_LOGIN):
        assert login(accounts, password="nope").status_code == 401
    assert login(accounts).status_code == 429


def test_me_and_profile_update(accounts):
    assert accounts.get("/auth/me", "member-km").json()["id"] == "member-km"
    assert accounts.get("/auth/me", "ghost").status_code == 401
    api = accounts.as_user("member-km")
    assert api.patch("/api/auth/profile", json={}).status_code == 400
    r = api.patch("/api/auth/profile", json={"username": "krishna2", "current_password": PASSWORD})
    assert r.status_code == 200, r.text
    assert run(server.db.users.find_one({"id": "member-km"}))["username"] == "krishna2"
    bad = api.patch("/api/auth/profile", json={"new_password": "another-long-pass-2", "current_password": "wrong"})
    assert bad.status_code in (400, 401, 403)


def test_logout_succeeds(accounts):
    assert accounts.as_user("member-km").post("/api/auth/logout").status_code == 200


def test_forgot_password_never_reveals_whether_the_account_exists(accounts):
    c = client(accounts)
    known = c.post("/api/auth/forgot-password", json={"login": "krishna"})
    unknown = c.post("/api/auth/forgot-password", json={"login": "ghost"})
    assert known.status_code == unknown.status_code == 200
    assert known.json() == unknown.json()


def test_reset_with_a_bad_token_is_refused(accounts):
    r = client(accounts).post("/api/auth/reset-password", json={"token": "x" * 40, "new_password": "brand-new-pass-1"})
    assert r.status_code == 400
