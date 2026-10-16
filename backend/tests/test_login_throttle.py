"""Failed-login throttle (server._check_login_throttle and friends).

Pure in-process logic: no database or live server needed. Importing server only
builds a lazy Mongo client, so dummy connection settings are enough.
"""
import os
import sys

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "throttle_test")
os.environ.setdefault("JWT_SECRET", "throttle-test-secret-0123456789abcdef")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi import HTTPException  # noqa: E402

import server  # noqa: E402


@pytest.fixture(autouse=True)
def _clean():
    server._login_fails.clear()
    yield
    server._login_fails.clear()


def test_blocks_after_max_failures_for_same_login_and_ip():
    for _ in range(server.LOGIN_MAX_FAILS_PER_LOGIN):
        server._check_login_throttle("1.1.1.1", "sam")
        server._record_login_failure("1.1.1.1", "sam")
    with pytest.raises(HTTPException) as err:
        server._check_login_throttle("1.1.1.1", "sam")
    assert err.value.status_code == 429
    assert int(err.value.headers["Retry-After"]) >= 1


def test_other_login_from_same_ip_is_not_blocked_by_one_login():
    for _ in range(server.LOGIN_MAX_FAILS_PER_LOGIN):
        server._record_login_failure("1.1.1.1", "sam")
    server._check_login_throttle("1.1.1.1", "neha")  # must not raise


def test_same_login_from_another_ip_is_not_locked_out():
    for _ in range(server.LOGIN_MAX_FAILS_PER_LOGIN):
        server._record_login_failure("1.1.1.1", "sam")
    server._check_login_throttle("2.2.2.2", "sam")  # a victim is not locked out everywhere


def test_one_ip_guessing_many_logins_is_blocked():
    for i in range(server.LOGIN_MAX_FAILS_PER_IP):
        server._record_login_failure("3.3.3.3", f"user{i}")
    with pytest.raises(HTTPException) as err:
        server._check_login_throttle("3.3.3.3", "someone-new")
    assert err.value.status_code == 429


def test_old_failures_age_out(monkeypatch):
    server._record_login_failure("1.1.1.1", "sam")
    real = server.time.monotonic
    monkeypatch.setattr(server.time, "monotonic", lambda: real() + server.LOGIN_FAIL_WINDOW_SECONDS + 1)
    for _ in range(server.LOGIN_MAX_FAILS_PER_LOGIN - 1):
        server._record_login_failure("1.1.1.1", "sam")
    server._check_login_throttle("1.1.1.1", "sam")  # the first failure expired, so still under the limit
