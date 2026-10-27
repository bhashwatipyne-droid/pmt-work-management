"""Unit tests for who can see whose efficiency (no live server needed).

Builds the efficiency router with a tiny in-memory users collection and checks
the scoping rules: admin -> everyone, manager -> own department (+ self),
everyone else -> only themselves.
"""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import efficiency

USERS = [
    {"id": "admin", "role": "admin", "department": "", "name": "A"},
    {"id": "m1", "role": "manager", "department": "Design", "name": "M1"},
    {"id": "m2", "role": "manager", "department": "Content", "name": "M2"},
    {"id": "m0", "role": "manager", "department": "", "name": "M0"},
    {"id": "d1", "role": "member", "department": "Design", "name": "D1"},
    {"id": "d2", "role": "member", "department": "Design", "name": "D2"},
    {"id": "c1", "role": "member", "department": "Content", "name": "C1"},
    {"id": "gone", "role": "member", "department": "Design", "name": "G", "active": False},
]


def _matches(doc, query):
    for key, cond in query.items():
        if key == "$or":
            if not any(_matches(doc, c) for c in cond):
                return False
        elif isinstance(cond, dict):
            if "$nin" in cond and doc.get(key) in cond["$nin"]:
                return False
            if "$ne" in cond and doc.get(key, None) == cond["$ne"]:
                return False
        elif doc.get(key) != cond:
            return False
    return True


class _Cursor:
    def __init__(self, docs):
        self.docs = docs

    async def to_list(self, _n):
        return self.docs


class _Users:
    def find(self, query, _proj=None):
        return _Cursor([dict(u) for u in USERS if _matches(u, query)])

    async def find_one(self, query, _proj=None):
        return next((dict(u) for u in USERS if _matches(u, query)), None)


def _hooks():
    """Pull the closures we want out of the router factory."""
    captured = {}
    router = efficiency.create_efficiency_router(
        db=SimpleNamespace(users=_Users()),
        get_acting_user=None,
        require_manager_or_admin=None,
        now_iso=lambda: "",
        log_activity=None,
        deliverable_type_categories={},
    )
    # The helpers are closures; reach them through a route endpoint's closure.
    for route in router.routes:
        fn = getattr(route, "endpoint", None)
        if fn and fn.__closure__:
            for name, cell in zip(fn.__code__.co_freevars, fn.__closure__):
                captured.setdefault(name, cell.cell_contents)
    return captured


H = _hooks()


def user(uid):
    u = next(x for x in USERS if x["id"] == uid)
    return SimpleNamespace(id=u["id"], role=u["role"], department=u["department"])


def ids(uid):
    return sorted(asyncio.run(H["_visible_ids"](user(uid))))


def test_admin_sees_everyone_active_non_admin():
    assert ids("admin") == ["c1", "d1", "d2", "m0", "m1", "m2"]


def test_manager_sees_own_department_and_self_only():
    assert ids("m1") == ["d1", "d2", "m1"]
    assert ids("m2") == ["c1", "m2"]


def test_manager_without_department_sees_only_self():
    assert ids("m0") == ["m0"]


def test_member_sees_only_self():
    assert ids("d1") == ["d1"]


@pytest.mark.parametrize(
    "viewer,target,allowed",
    [
        ("admin", "c1", True),
        ("m1", "d2", True),
        ("m1", "c1", False),
        ("m1", "m2", False),
        ("m0", "d1", False),
        ("d1", "d1", True),
        ("d1", "d2", False),
        ("d1", "m1", False),
    ],
)
def test_assert_can_view(viewer, target, allowed):
    check = H["_assert_can_view"]
    if allowed:
        asyncio.run(check(user(viewer), target))
    else:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(check(user(viewer), target))
        assert exc.value.status_code == 403
