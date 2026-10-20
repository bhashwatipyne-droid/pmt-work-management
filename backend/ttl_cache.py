"""Small in-process cache for read endpoints that are polled or expensive.

Two rules keep it safe:

* **Any write drops everything.** The app calls `bump()` after every request that
  is not a GET/HEAD/OPTIONS, and an entry is only served while no bump has
  happened since it was computed. So a person who changes something and then
  re-reads a count always sees their own change at once.
* **A time limit covers what that cannot see**: background sweeps, the WhatsApp
  listener and other server instances write without going through this process's
  requests, so an entry is also dropped after `ttl` seconds.

Concurrent callers asking for the same key share one computation instead of each
running the same queries.

Cached values are shared between callers, so treat them as read-only.
"""
import asyncio
import time
from typing import Any, Awaitable, Callable, Dict, Optional, Tuple


class VersionedTTLCache:
    def __init__(
        self,
        ttl: float = 30.0,
        max_entries: int = 2000,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.ttl = ttl
        self.max_entries = max_entries
        self._clock = clock
        self._version = 0
        # key -> (value, version when computing started, expiry)
        self._store: Dict[str, Tuple[Any, int, float]] = {}
        self._inflight: Dict[Tuple[str, int], "asyncio.Future"] = {}
        self.hits = 0
        self.misses = 0

    @property
    def version(self) -> int:
        return self._version

    def bump(self) -> None:
        """Something was written: every cached value is now suspect."""
        self._version += 1
        # Nothing cached before this point can be served again, so free it.
        self._store.clear()

    def clear(self) -> None:
        self._store.clear()

    async def get_or_compute(
        self,
        key: str,
        compute: Callable[[], Awaitable[Any]],
        ttl: Optional[float] = None,
    ) -> Any:
        now = self._clock()
        entry = self._store.get(key)
        if entry and entry[1] == self._version and entry[2] > now:
            self.hits += 1
            return entry[0]

        self.misses += 1
        version = self._version
        flight_key = (key, version)
        pending = self._inflight.get(flight_key)
        if pending is not None:
            return await asyncio.shield(pending)

        future: "asyncio.Future" = asyncio.get_running_loop().create_future()
        self._inflight[flight_key] = future
        try:
            value = await compute()
        except BaseException as exc:  # noqa: BLE001 - hand the failure to every waiter
            if not future.done():
                future.set_exception(exc)
                # Nobody may be waiting; stop asyncio warning about it.
                future.exception()
            raise
        else:
            if not future.done():
                future.set_result(value)
            # Stored under the version seen when computing began: a write that
            # landed meanwhile makes this entry stale on arrival, never served.
            if version == self._version:
                if len(self._store) >= self.max_entries:
                    self._evict(now)
                self._store[key] = (value, version, self._clock() + (self.ttl if ttl is None else ttl))
            return value
        finally:
            self._inflight.pop(flight_key, None)

    def _evict(self, now: float) -> None:
        for k in [k for k, (_, _, exp) in self._store.items() if exp <= now]:
            self._store.pop(k, None)
        if len(self._store) >= self.max_entries:
            # Still full of live entries: drop the oldest-expiring half.
            for k, _ in sorted(self._store.items(), key=lambda kv: kv[1][2])[: self.max_entries // 2]:
                self._store.pop(k, None)
