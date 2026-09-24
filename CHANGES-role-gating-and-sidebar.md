# Role gating flattened + new sidebar / ⌘K / help / worksheet search

## Who can do what
| | Admin | Manager | Member |
|---|---|---|---|
| Home (/dashboard) | view | – | – |
| Work sheet | view only | edit | edit own |
| Projects | view + edit | view only | view only |
| Approvals | view only | view + act | view only |
| Efficiency | view only | view + edit | view only |
| Clients / Team | view + edit | – | – |

Single source of truth: `frontend/src/lib/permissions.js` (used by the sidebar,
⌘K palette, route guards and pages). Backend enforces the same rules.

## Backend (server.py, efficiency.py)
- Project detail readable by all; non-admins only get visible projects.
- Project/deliverable hide, unhide, bulk hide/unhide/delete, delete: admin only.
- Approvals: admins + members see the full board read-only; managers keep their
  scoped board. approve / send-back / move / hide / legacy approve+reject: manager only.
- Efficiency monthly-capacity POST/PUT/DELETE: manager only.
- work-items and projects `search` are regex-escaped (a "(" no longer 500s).
- New tests: backend/tests/test_role_flattening.py (live-server style).

## Frontend
New: lib/permissions.js, lib/appActions.js, hooks/useAccess.js,
hooks/usePinnedProjects.js, components/layout/{CommandCenter,CommandPalette,
HelpShortcuts,RequireAccess}.jsx, components/layout/navItems.js
Changed: Sidebar, AppLayout, NotificationCenter (placement prop), App.js,
Projects/ProjectDetail/Approvals/Efficiency* pages, project components,
WorkSheetPage + WorkSheetToolbar, Clients/Team pages (open-add from palette).

## Known consequence to decide on
Admins can no longer act on approvals. Before, only admins could act on
Leadership and Client SPOC items; managers only act on their department's
Manager items, Compliance (Administration dept) or items assigned to them.
Those two queues are now read-only for everyone unless assigned to a manager.
