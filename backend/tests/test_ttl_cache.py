"""VersionedTTLCache: serving, expiry, write invalidation, shared computation."""
import asyncio
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from ttl_cache import VersionedTTLCache  # noqa: E402


class Clock:
    def __init__(self):
        self.t = 100.0

    def __call__(self):
        return self.t


def run(coro):
    return asyncio.run(coro)


def make(ttl=30.0, **kw):
    clock = Clock()
    return VersionedTTLCache(ttl=ttl, clock=clock, **kw), clock


def test_second_call_is_served_from_cache():
    cache, _ = make()
    calls = []

    async def compute():
        calls.append(1)
        return {"count": 5}

    async def go():
        a = await cache.get_or_compute("k", compute)
        b = await cache.get_or_compute("k", compute)
        return a, b

    a, b = run(go())
    assert a == b == {"count": 5}
    assert len(calls) == 1


def test_entry_expires_after_ttl():
    cache, clock = make(ttl=30)
    calls = []

    async def compute():
        calls.append(1)
        return len(calls)

    async def go():
        first = await cache.get_or_compute("k", compute)
        clock.t += 31
        second = await cache.get_or_compute("k", compute)
        return first, second

    assert run(go()) == (1, 2)


def test_a_write_invalidates_everything_immediately():
    cache, _ = make()
    n = {"v": 1}

    async def compute():
        return n["v"]

    async def go():
        first = await cache.get_or_compute("k", compute)
        n["v"] = 2
        cache.bump()  # what the middleware does after a POST/PATCH/DELETE
        second = await cache.get_or_compute("k", compute)
        return first, second

    assert run(go()) == (1, 2)


def test_write_during_compute_is_not_cached_as_fresh():
    cache, _ = make()
    gate = asyncio.Event()
    n = {"v": 1}

    async def slow():
        seen = n["v"]
        await gate.wait()
        return seen

    async def go():
        task = asyncio.create_task(cache.get_or_compute("k", slow))
        await asyncio.sleep(0)
        n["v"] = 2
        cache.bump()  # the write lands while the old value is still being computed
        gate.set()
        stale_for_that_caller = await task

        async def fresh():
            return n["v"]

        later = await cache.get_or_compute("k", fresh)
        return stale_for_that_caller, later

    assert run(go()) == (1, 2)


def test_concurrent_callers_share_one_computation():
    cache, _ = make()
    calls = []

    async def compute():
        calls.append(1)
        await asyncio.sleep(0.01)
        return "x"

    async def go():
        return await asyncio.gather(*[cache.get_or_compute("k", compute) for _ in range(10)])

    assert run(go()) == ["x"] * 10
    assert len(calls) == 1


def test_errors_are_not_cached_and_reach_every_waiter():
    cache, _ = make()
    calls = []

    async def boom():
        calls.append(1)
        await asyncio.sleep(0.01)
        raise RuntimeError("db down")

    async def ok():
        return "fine"

    async def go():
        results = await asyncio.gather(
            *[cache.get_or_compute("k", boom) for _ in range(3)], return_exceptions=True
        )
        after = await cache.get_or_compute("k", ok)
        return results, after

    results, after = run(go())
    assert all(isinstance(r, RuntimeError) for r in results)
    assert len(calls) == 1
    assert after == "fine"


def test_keys_are_independent_and_size_is_bounded():
    cache, _ = make(max_entries=10)

    async def go():
        for i in range(50):
            await cache.get_or_compute(f"k{i}", lambda i=i: _const(i))

    async def _const(v):
        return v

    run(go())
    assert len(cache._store) <= 10
