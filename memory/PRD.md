# PRD — Spreadsheet-first Project Management Tool (working title: PMT)

## Original problem statement
A simple, spreadsheet-first project management tool with:
- **Members / Managers**: a Google Sheets-like Work Sheet for logging daily activities.
- **Admins**: dashboard, projects, team, approvals, clients — a full admin cockpit inspired by the "PMT Prototype" screen recording + reference screenshots the user shared.

## Explicit user decisions (locked)
- Row granularity: one row = one work activity.
- Deferred until later: parent-deliverable grouping (superseded by real Project→Deliverable hierarchy, see Phase 3).
- **Authentication**: skipped for now. Demo role switcher via localStorage `acting_user_id`. Real registration/approval flow is deferred (Team page's "New Approvals" panel is a placeholder).
- Historical import: user will supply a cleaned CSV/XLSX when import phase runs. Do NOT seed from the old pasted chat data.
- Build order: Sheet → Admin Dashboard → Projects → Wire Sheet to Deliverables → Approvals → Team → Clients → Dashboard redesign → Sidebar polish.
- Work Sheet ↔ Project linkage: **rows belong to a Deliverable** (via project_id + deliverable_id + stage). Confirmed by user.
- Stages are **fixed**: Content → Design → Animate → Finish.
- Departments are **fixed** (backend-managed): Content, Design, Animation, Finish, Administration.
- Recommended status workflow (member workflow): Not Started, Ongoing, Ready for Review, Changes Requested, Closed.
- Deliverable stage_status workflow (approvals workflow): Not Started, In Progress, Ready for Review, Changes Requested, Completed.
- **Approvals queue** shows only `Ready for Review` — rejected items go back to the assignee and disappear from the queue.

## Data model (implemented)
```
Client (id, name, contact_person, status)
  └── Project (id, code, name, client_id, start/end date, poc_id, status ∈ {Planning, Active, In Rework, Completed})
        └── Deliverable (id, project_id, name, type, owner_id, start_dt, end_dt, current_stage, stage_status, last_review_note/action/reviewer_id)
              └── WorkItem (id, work_date, project_id, deliverable_id, stage, deliverable_name, type, category, version, time_taken_minutes, creator_id, reviewer_id, remarks, status)

User (id, name, email, role ∈ {admin, manager, member}, department, active)
```

## Roles & visibility
- **Admin**: 5 admin tabs (Dashboard, Projects, Team, Approvals, Clients) + Work Sheet.
- **Manager**: Approvals + Work Sheet.
- **Member**: Work Sheet only. Can edit only rows they created. Backend enforces row-level 403.

## Implemented (Phases 1-7)
### Phase 1 — Clients (minimal)
- `GET/POST /api/clients` — list + admin-only add.
- Frontend `/clients` page with search, table (Name/Contact/Status/Projects), Add Client modal.
- AMFI seeded on startup.

### Phase 2 — Projects
- Full CRUD for Projects + inline Deliverables at create time.
- Chart View (kanban 4-column: Planning/Active/In Rework/Completed) + List View toggle.
- 4 metric cards: Active Projects, In Rework, Due This Week, Deliverables.
- ProjectCard with client, POC, stage dots (Content/Design/Animate/Finish counts), collaborators, deadline, "Open →".
- Auto-generated project codes (`proj` + 9 random chars).

### Phase 3 — Work Sheet ↔ Projects
- WorkItem model extended with `project_id`, `deliverable_id`, `stage`.
- New columns in the sheet: **Project / Deliverable Link / Stage** (inline dropdowns).
- Cascading: deliverable dropdown filters by selected project.
- Sticky context: last-used project/deliverable/stage saved to localStorage → auto-fills new rows (Google Sheets-like feel).
- Bulk-assign popover: select rows → pick project + deliverable + stage → Apply.
- Row-level permissions: members see the new selects disabled on other members' rows (backend also enforces 403).

### Phase 4 — Approvals
- `/api/approvals` returns deliverables in `Ready for Review`.
- Approve → advances stage (Content→Design→Animate→Finish, Finish→Completed).
- Reject → sets `Changes Requested` with note; disappears from queue.
- `/approvals` page with cards + note textarea + Approve / Send Back buttons.
- Visible to admin + manager. Members see "admins/managers only" notice.

### Phase 5 — Team
- `/api/users` POST/PATCH (admin-only), with role + department validation.
- `/team` page: New Approvals empty panel (auth deferred), Previous Approvals roster with editable Department + Role dropdowns + Save Role, Active/Inactive badge, "+ Add Team Member" modal.

### Phase 6 — Dashboard (redesigned, project-centric)
- `/api/dashboard/overview` returns project counts, deliverable stage counts, needs_review, due_this_week, hours logged.
- `/dashboard` page: 4 metric cards (Active Projects / Needs Review / Due This Week / Total Deliverables), Deliverable Progress by Stage panel, Recent Projects list, Pending Approvals side panel.

### Phase 7 — Sidebar/Shell polish
- Dark navy sidebar matching "PMT Prototype" reference: brand + 6 nav items (role-filtered), user footer card, Logout (disabled, auth deferred).
- Top bar with breadcrumb + role switcher + notification bell.

## Testing provenance
- iteration_1.json: Work Sheet MVP — 20/20 backend, all frontend flows.
- iteration_2.json: Admin Dashboard + bulk actions — 19/19 backend, all flows.
- **iteration_3.json**: Phases 3-7 — 26/26 new backend tests + full frontend regression, 100% pass. Two minor UX polish items fixed in-line (low-contrast "Acting as" label; member row-level select disabled).
- User acceptance:
  - Work Sheet MVP: user-confirmed working.
  - Admin Dashboard + checkboxes: user-confirmed working.
  - Projects module (Phase 2): user-confirmed working.
  - Phases 3-7: shipped + testing-agent-verified, awaiting user confirmation.

## Recent additions (Feb 2026, post-Phase 7)
- **Work Sheet flat-spreadsheet view**: gridlines, row numbers, green header row, borderless cells, sticky header — matches the user's actual Google Sheet look. Columns, functionality, and dropdowns are unchanged.
- **Project Detail View** (`/projects/:id`): header w/ status/POC/dates, per-stage counts, Deliverables list w/ inline Approve/Send Back for Ready-for-Review items, Work Log filtered to this project. Now also has **"+ Add Deliverable"** button and **pencil edit icon** per deliverable (admin only) — opens a modal to add or edit name/type/owner/dates/stage/stage_status.
- **Deliverable Types** updated to the user's 29 domain-specific list (Internal Meets, Client Meets, Campaign Ideation variants, Emailers, Carousel, GIF, Reels, Data Research SMI/Web, etc). Old generic types removed.
- **Sheet-like inline row entry**: replaced "Add Row" button with a draft row at the top of the sheet. Any field change triggers row creation on blur (like Google Sheets). Sticky project/deliverable/stage context carried across new rows via localStorage.
- **Client Editing**: pencil icon on Clients opens a proper Edit modal with rename, contact update, and Archive/Restore. Backend PATCH /api/clients/{id} added, admin-only.
- **Work-items filtering**: /api/work-items now supports `project_id` and `deliverable_id` query params for the project detail view.
- **"Add 100 rows below"** bulk-add button on Work Sheet toolbar.
- **FIXED (2026-09-01) — "Add 100 rows" prefilled-rows bug**: RCA showed the frontend/backend were already correctly sending an empty template (project_id/deliverable_id/stage = null); the perceived bug was ~1100 leftover junk/duplicate rows accumulated in the DB from earlier repro/testing sessions (both a real pre-fix bug run and repeated agent test clicks), which mixed old prefilled rows with new correct empty ones and made the sheet slow/confusing. Cleaned DB back to 10 legitimate seed rows. Hardened the bulk-add button with a `useRef` synchronous guard + `disabled` state (`bulkAdding`) to prevent any future double-submit. Verified via testing_agent iteration_5 (100% pass — 6/6 backend pytest, full frontend Playwright regression, smoke test on Dashboard/Projects/Team/Approvals/Clients).

## Backlog / next candidates (P1)
- **CSV/XLSX import** for historical work items (user will supply cleaned file).
- **Export** Sheet to CSV/Excel.
- **Deliverable CRUD from Project Detail** (add/edit/delete deliverables directly in a project).
- Activity history / audit log on deliverables and work items.
- Notifications (in-app for approvals & new assignments).
- Refactor: split `server.py` into routers (users, projects, deliverables, approvals, dashboard, work_items).
- **Deferred (paused by user)**: 4-segment progress bar per deliverable (Content/Design/Animate/Finish) on Dashboard/Project Detail, showing current-stage-in-progress vs closed.
- **Open question for user**: since Admin's Work Sheet is now fully view-only, the pre-existing admin-only single-row delete (trash icon) and bulk-delete-selected are now unreachable via UI (backend still restricts delete to admin role, unchanged). No other role was given delete rights. Flag to user: should delete rights move to Manager (own department) or stay admin-only/unused for now?
- Deliverable Type dropdown is still shared (all 29 types) across all departments — user explicitly deferred per-department splitting until after beta testing.
- Forgot/reset-password flow — explicitly not required by user for now.
- "Create user with password" UI on Team page — explicitly deferred; admin sets password_hash directly in MongoDB for new users for now.

## Recent additions (Sep 2026) — Real JWT auth (replaces mock role-switcher)
- **Simple email/password sign-in** (JWT, httpOnly cookie, 24h expiry, bcrypt password hashing) — NO registration, NO Google/OAuth, per explicit user request. New endpoints: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`.
- **Mock "Acting As" role-switcher fully removed** (`RoleSwitcher.jsx` deleted, `localStorage acting_user_id` gone). `UserContext.jsx` is now a real AuthContext (same `currentUser/currentUserId/users/loading` shape so no page-level changes needed) with `login()`/`logout()`/`isAuthenticated`.
- **All ~28 backend endpoints** refactored from `X-User-Id` header mock-auth to `request: Request` + `get_acting_user(request)` reading the JWT cookie (falls back to `Authorization: Bearer` header for API/testing convenience). Every business endpoint now requires a valid session (401 otherwise), including `/api/clients` and `/api/users`.
- **6 seed users given demo passwords** on startup (idempotent, won't overwrite if changed): aisha@thefinpedia.com/admin123, rahul@thefinpedia.com/manager123, priya@thefinpedia.com/manager123, sam@thefinpedia.com/member123, neha@thefinpedia.com/member123, vikram@thefinpedia.com/member123. See `/app/memory/test_credentials.md`.
- **New LoginPage.jsx** — simple centered dark-navy sign-in card matching sidebar branding. Sidebar "Logout" button now functional (was disabled placeholder).
- `CORS_ORIGINS` tightened from `*` to the explicit preview host (was a latent issue with `allow_credentials=True`).
- Verified via testing_agent iteration_8 (100% pass — 31/31 backend pytest incl. all 6 logins + permission-model regression, full frontend Playwright). Two minor follow-ups (protect `/api/clients` GET, tighten CORS_ORIGINS) applied post-test and re-verified via curl.

## Recent additions (Sep 2026) — Admin view-only + department-scoped editing
- **Admin Work Sheet = fully view-only**: no draft row, no Add-Row/Add-100-rows/Close-Deliverable buttons, every cell (including checkboxes) disabled. Enforced both frontend (render-level) and backend (`POST/PATCH/bulk-create /work-items` return 403 for admin role).
- **Visibility opened up**: `GET /api/work-items` no longer filters to only the requester's own rows for members — everyone (member/manager/admin) now sees ALL rows. Editing remains restricted.
- **Department-scoped editing**: Members can only edit rows they created. Managers can only edit rows created by someone in their OWN department (Content/Design/Animation) — cross-department rows render fully disabled. New shared helper `/app/frontend/src/lib/worksheetPermissions.js` (`canEditWorkItem`) used by `WorkSheetRow` + `WorkSheetTable` (select-all scoping). Backend `scoped_update_fields()` takes a `creator_department` param and blocks manager edits when department doesn't match (including when creator_department is missing).
- **Column rename/restructure**: "Deliverable Link" (was actually the structural `deliverable_id` dropdown) renamed to plain **"Deliverable"**. New **"Deliverable Link"** column added — genuine free-text field (`deliverable_link` on WorkItem) for pasting a Drive/Figma URL, editable by row owner (member on own row) or department manager.
- **"Deliverable Closed" button**: new solid green button, top-left of Work Sheet toolbar, Manager-role only. Opens a modal (Project select → in-progress-Deliverable select) → "Close Stage" reuses the existing `/deliverables/{id}/approve` endpoint to advance the deliverable's stage (Content→Design→Animate→Finish→Completed), reflected on Admin Dashboard / Project Detail.
- **Admin Edit Deliverable modal**: "Current Stage" and "Stage Status" are now read-only badges (no longer editable dropdowns) — fully driven by the Work Sheet's "Deliverable Closed" action now.
- Verified via testing_agent iteration_6 (100% pass — 14/14 backend pytest, full frontend Playwright regression across admin/manager/member roles). One minor a11y polish item (DialogDescription) fixed post-test.

## Architecture / operational notes
- Backend: FastAPI + Motor (MongoDB) on port 8001, `/api` prefix.
- Frontend: React + shadcn/ui + Tailwind on port 3000. Sonner for toasts.
- Preview URL comes from `REACT_APP_BACKEND_URL` in `/app/frontend/.env`.
- Env: `MONGO_URL`, `DB_NAME` in `/app/backend/.env`.
- Role simulation: `X-User-Id` header on API; frontend stores selection in `localStorage.acting_user_id`.
- Do NOT reintroduce bulk-update behaviour that aborts the entire batch on one permission-violating row — current behaviour is skip-and-continue.
