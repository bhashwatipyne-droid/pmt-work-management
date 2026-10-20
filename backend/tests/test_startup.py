"""The startup routine and the background sweeps run end to end on an in-memory
database. Route tests never run these, so a missing import or a renamed helper
in startup code would otherwise only show up when the server boots."""
import asyncio
import sys
from pathlib import Path

import pytest

pytest.importorskip("mongomock_motor")
sys.path.insert(0, str(Path(__file__).parent))

from test_planning_integration import env, run, server  # noqa: E402,F401


def test_startup_migrations_and_index_setup_run_clean(env):
    async def boot():
        await server.run_startup_migrations()
        # the app starts two forever-loops; stop them so the test can end
        for name in ("_auto_accept_task", "_calendar_sync_task"):
            task = getattr(server, name, None)
            if task is not None:
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):
                    pass

    run(boot())
    assert run(server.db.users.count_documents({})) > 0  # data untouched by the migrations


def test_background_sweeps_and_scans_run_clean(env):
    async def sweeps():
        return (
            await server.auto_close_stale_reviews(),
            await server.auto_close_stale_rows(),
            await server.auto_close_stale_project_tasks(),
        )

    assert all(isinstance(n, int) for n in run(sweeps()))
    run(server._ensure_overdue_notifications())
    run(server._ensure_reminder_notifications())
