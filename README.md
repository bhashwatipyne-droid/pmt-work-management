# PMT — Project & Work Management

A web-based project, production, and team-work management application for coordinating projects, deliverables, approvals, work logs, capacity, efficiency, planning, and invoicing in one workspace.

PMT brings project execution and operational visibility into a centralized application, helping teams manage work from planning through delivery and review.

---

## Table of Contents

- [Overview](#overview)
- [Recent Changes](#recent-changes)
- [Core Modules](#core-modules)
- [Technology Stack](#technology-stack)
- [Application Architecture](#application-architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Environment Variables](#environment-variables)
- [Database Model and Conventions](#database-model-and-conventions)
- [API Structure](#api-structure)
- [Testing and Quality Checks](#testing-and-quality-checks)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Development Workflow](#development-workflow)
- [Security Guidelines](#security-guidelines)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

PMT is designed to manage project delivery, production workflows, team responsibilities, and operational reporting.

The application consists of two primary components:

- **Frontend:** React single-page application.
- **Backend:** FastAPI service with MongoDB persistence.

The frontend communicates with the backend over HTTP. The backend handles application APIs, data access, authentication, and business logic.

Integrations around the core application:

- **WhatsApp tasklist listener** (separate repository, `task_assignment_automation`): reads managers' daily tasklists from WhatsApp groups, matches each line to a client, project and deliverable, and writes `tasklist_items` that PMT's Planning page and task cards consume. See `docs/whatsapp-task-integration.md`.
- **Google Calendar** feeds the Meetings page (`docs/google-calendar-setup.md`).
- **TFP Premium Content Planner sheet** pushes new rows into PMT through an Apps Script (`integrations/premium_sheet_sync.gs`).
- **Project sharing** turns a project into a link that previews in WhatsApp (`docs/project-sharing.md`).
- Optional product analytics (PostHog), browser push notifications (Firebase), and email delivery (Brevo or SMTP).

A public **demo mode** at `/demo` runs the whole interface on sample data in the browser, with no account and no backend calls.

> **Last updated: 2026-10-31.** Recent additions are listed in [Recent Changes](#recent-changes).

## Recent Changes

Changes since the previous README update (2026-10-23), newest first. See `git log` for the full history.

**2026-10-31**
- Public demo mode at `/demo` with in-browser sample data, including sample Planning and Meetings screens.
- A 76-second PMT product film for the portfolio, kept in `portfolio-video/`.

**2026-10-30**
- Planning: redesigned held tasklist items (filter tabs, per-line include checkbox, bulk Send, match score); held items let you pick the deliverable type and confirm work that has no project (such as hiring) by its type.
- Planning insights flag a deliverable repeated across rows for one person as possible rework.
- Work Sheet: compact Google-Sheets-style rows (about 28px), a row you just edited stays visible under a filter until the filter changes, and the project picker offers only projects in the Kanban's Active column (admins see every project).
- Team Reviews and Feedback rows, and Content rows of type Data Research and Analysis (SMI/Web), can cover several deliverables.
- Home: Portfolio health lists only projects with active work; the rest are behind Show all.

**2026-10-29**
- Held tasklist lines: a "Team" line becomes one task with the posting manager as owner and the team as collaborators; lines with nobody named let you choose one or several people; released held tasks keep their original date on the Work Sheet.
- Planning card: edit project, deliverable and type, and the matcher learns from the edit.
- Projects and deliverables require start and end dates.
- Home chart splits each bar into spilled-over and started-in-month work.

**2026-10-28**
- Home: 12-month chart ending at the current month; Planning: task card on bar click and a "Held tasklist items" panel with the matcher's learned rules (with an off switch).
- Team: remove people who have left (deactivates login, hides from Team, keeps history).
- Hiring and Interviews is a Core activity; admins can edit and delete every Work Sheet row.

**2026-10-27**
- Work Sheet: Client column filter, per-column Wrap text, spillover from earlier months counted on Home.
- Import infers the closest deliverable type (for example Video → Long Video).
- Premium sheet sync: status is optional, and `PMT_URL` points at the Singapore backend.

## Core Modules

### 1. Home Dashboard

Provides a high-level overview of project and production activity.

Key capabilities include:

- Project and deliverable summaries for a chosen month, including work spilled over from earlier months.
- A 12-month chart (`backend/home_monthly.py`) whose bars match the numbers in each month's header.
- Portfolio health, limited to projects with active work.
- Approval and work-status visibility.
- Team activity and operational reporting.

Home APIs are implemented in `backend/home_dashboard.py` and `backend/home_monthly.py`; the page is `frontend/src/pages/DashboardPage.jsx` with components under `frontend/src/components/dashboard/`.

### 2. Projects and Deliverables

Supports project creation, project management, and deliverable tracking.

Key capabilities include:

- Create and update projects.
- Associate projects with clients and points of contact.
- Manage project dates and lifecycle status.
- Create, edit, and import deliverables.
- Track deliverable stages and completion status.
- View project-level deliverable information.
- Filter projects and use list or Kanban-style views.
- Perform supported bulk actions.

Relevant frontend files:

- `frontend/src/pages/ProjectsPage.jsx`
- `frontend/src/pages/ProjectDetailPage.jsx`
- `frontend/src/components/projects/`

### 3. Worksheet and Work Logging

The Worksheet is used to record and manage work associated with projects and deliverables.

Key capabilities include:

- Log work against projects and deliverables.
- Track work dates, categories, time, ownership, and status.
- Filter worksheet records, including by client, with per-column Wrap text; rows are compact, like Google Sheets.
- Pick a project and deliverable from searchable dropdowns. Only projects in the Kanban's Active column (and their deliverables) are offered; admins see every project and deliverable.
- Log one row against several deliverables for types that allow it (Team Reviews and Feedback, and Data Research and Analysis for Content).
- Receive rows created automatically when a person accepts a WhatsApp task card (`source=whatsapp_task`).
- Support task-level review and approval workflows.
- Maintain work history where supported by the implementation.

Admins can edit and delete every row; other roles are limited by `backend/work_items_rules.py` and `frontend/src/lib/worksheetPermissions.js`.

The **Projects** tab of the Work Sheet is a separate follow-up list for the Projects team (`backend/project_tasks.py`, routes under `/api/project-tasks`). A task is one row that stays open until it is marked Done, and each day's changes are kept as an update note instead of copying the list to a new date block.

Primary frontend file:

`frontend/src/pages/WorkSheetPage.jsx`

Additional worksheet rules and helpers are located in `frontend/src/lib/` (the `worksheet*.js` files) and `frontend/src/components/work-sheet/`.

### 4. Approvals

Supports the review of work and deliverables.

Key capabilities include:

- Identify items awaiting review.
- Review work and deliverables.
- Filter approval records.
- Perform supported approval and send-back actions.
- Track review-related information.

Relevant files:

- `frontend/src/pages/ApprovalsPage.jsx`
- `frontend/src/components/approvals/`

### 5. Clients and Team

Provides management interfaces for client records, contact information, and team members.

Key capabilities include:

- Maintain client records.
- Manage client contacts and points of contact.
- Manage team members and application access.
- Remove people who have left: the dustbin deactivates their login and hides them from Team while keeping their history.
- Associate people with relevant projects and work.

Relevant frontend pages include `ClientsPage.jsx` and `TeamPage.jsx` under `frontend/src/pages/`.

### 6. Efficiency and Capacity

Provides employee-level and team-level efficiency reporting.

Key capabilities include:

- View activity and efficiency metrics.
- Configure employee activity targets.
- Manage monthly capacity inputs.
- Review employee-level details.
- Compare team-level operational summaries.

Backend implementation:

`backend/efficiency.py`

The frontend pages and components are located under:

- `frontend/src/pages/`
- `frontend/src/components/efficiency/`

### 7. Planning

Connects the WhatsApp tasklist listener to the people doing the work. The listener parses each manager's daily tasklist and stores one `tasklist_items` document per task line; PMT only serves, validates and moves those documents (`backend/planning.py`, routes under `/api/planning`). Nothing is assigned by guesswork: a line is `pending` only when the matcher was certain and every ID was re-checked against live data.

```text
needs_review --resolve--> pending --accept--> accepted   (Work Sheet row created)
     |                       |  \--decline--> declined --reassign--> pending
     \--reject--> rejected    \--reassign--> pending (another person)
```

- **Team members** see "Task assigned to you" cards and can accept (adds the row to their Work Sheet), decline with a reason, or ask a question. A card nobody answers is accepted for the person after `PLANNING_AUTO_ACCEPT_MINUTES` (default 60; `0` turns it off), counted from when it became visible to them (posted, released from review, or reassigned). Only today's cards are auto-accepted; cards left over from earlier days are not.
- **Managers (own department) and admins** see the Planning overview for Content, Design and Animation, reassign tasks, and work through **Held tasklist items**: filter tabs, a per-line include checkbox, bulk Send, a match score, searchable project and deliverable pickers, a deliverable type, and a choice of who a line is for (one or several people). A "Team" line becomes one task owned by the posting manager with the rest of the team as collaborators.
- Editing a card or resolving a held line teaches the matcher; the rules it learned are listed and can be switched off (`/api/planning/learned-rules`).
- Weekends and the days in `PLANNING_HOLIDAYS` are not planned; each task is planned at `PLANNING_DEFAULT_ESTIMATE_MINUTES` until a person changes it.
- Planning insights flag a deliverable repeated across rows for one person as possible rework.

Relevant files:

- `backend/planning.py`
- `frontend/src/pages/PlanningPage.jsx`
- `frontend/src/components/planning/`
- `frontend/src/services/planningApi.js`
- `docs/whatsapp-task-integration.md`

The listener lives in the separate `task_assignment_automation` repository. Without it running, the Planning page works but receives no new WhatsApp tasks.

### 8. Invoicing

Provides invoice-related workflows and finance views.

Relevant files:

- `backend/invoicing.py`
- `frontend/src/pages/InvoicingPage.jsx`

### 9. Notifications and Integrations

The application supports notification and integration functionality where configured.

Relevant components include:

- In-app notifications.
- Optional browser push notifications through Firebase.
- Password-reset email through SMTP or Brevo.
- Optional product analytics through PostHog.

Relevant files:

- `frontend/src/components/notifications/`
- `frontend/src/lib/firebase.js`
- `frontend/src/lib/push.js`
- `frontend/src/analytics.js`

A background scan creates overdue and reminder notices every `NOTIFICATION_SCAN_INTERVAL_MINUTES` (default 360). Helpers live in `backend/notifications.py`.

### 10. Meetings

Shows the Google Calendar events of the company calendars (`CALENDAR_IDS`). A background sweep (`CALENDAR_SYNC_MINUTES`, default 10) reads each calendar through the Google Calendar API, read-only, and keeps a copy in `calendar_events`, so the page never waits on Google and keeps working if Google is down. Access uses a Google Workspace service account with domain-wide delegation; a Workspace super admin does the one-time setup described in `docs/google-calendar-setup.md`.

Relevant files: `backend/meetings.py` (routes under `/api/meetings`), `frontend/src/pages/MeetingsPage.jsx`, `frontend/src/components/meetings/`.

### 11. Project Sharing

The **Share** button on a project page (managers and admins) creates one link for the project. Pasted into WhatsApp it unfurls into a card with the project name, "N of M deliverables done" and an image of the deliverables table; opened, it shows the full read-only list. The link can be stopped at any time.

Relevant files: `backend/project_share.py`, `frontend/api/share-preview.js` and `frontend/api/share-image.js` (Vercel functions), the `/share/:token` rewrite in `frontend/vercel.json`, and `docs/project-sharing.md`.

### 12. Premium Content Sheet Sync

Pushes rows from the "Premium Content" tab of the TFP Premium Content Planner Google Sheet into PMT. An Apps Script (`integrations/premium_sheet_sync.gs`) posts the rows to `POST /api/integrations/premium-sheet/sync` with the `X-Sync-Token` header (`SHEET_SYNC_TOKEN`). Each row that PMT does not have yet becomes a deliverable in that month's project (for example "TFP Oct-26" under the Thefinpedia client, created if missing). The sync is append-only: rows already in PMT are skipped and nothing is edited or deleted, so running it twice is harmless. Status is optional, and only months from `PREMIUM_SHEET_FROM_MONTH` onward are sent.

Relevant files: `backend/premium_sheet_sync.py`, `integrations/premium_sheet_sync.gs`, `tests/test_premium_sheet_sync.py`.

### 13. Public Demo Mode

Opening `/demo` on the deployed site turns on demo mode for that browser tab only. Every API call is answered in the browser from made-up sample data, so a visitor can click through the app without an account and without touching the real backend or database. The flag lives in `sessionStorage`, so a normal visit or a real sign-in in another tab is never affected.

Relevant files: `frontend/src/demo/` (`demoMode.js`, `adapter.js`, `seed.js`, `server.js`, plus sample Planning and Meetings data). `portfolio-video/` holds a short product film for the portfolio.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 |
| Routing | React Router |
| UI styling | Tailwind CSS |
| UI primitives | Radix UI |
| Icons | Lucide React |
| HTTP requests | Axios |
| Data fetching | TanStack React Query and SWR where used |
| Charts | Recharts |
| Backend | Python and FastAPI |
| ASGI server | Uvicorn |
| Database | MongoDB |
| Database access | Motor and PyMongo |
| Authentication | Application-level JWT handling |
| Password security | Password hashing |
| Notifications | Firebase integration where configured |
| Product analytics | PostHog, optional |
| Calendar | Google Calendar API through a service account |
| Share cards | Pillow (1200 × 630 preview image) and Vercel serverless functions in `frontend/api/` |
| Frontend hosting | Vercel (`frontend/vercel.json`) |
| Backend hosting | Render |
| Backend testing | Pytest |
| Frontend tooling | Create React App with CRACO |

Exact dependency versions are defined in `frontend/package.json` and `backend/requirements.txt`.

---

## Application Architecture

```text
                    ┌──────────────────────┐
                    │       Browser        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    React Frontend     │
                    │      frontend/       │
                    └──────────┬───────────┘
                               │
                         HTTP / REST API
                               │
                               ▼
                    ┌──────────────────────┐
                    │    FastAPI Backend   │
                    │ backend/server.py    │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌────────────┐   ┌────────────┐   ┌────────────┐
       │  Projects  │   │ Efficiency │   │  Invoicing │
       │ Deliverables│  │ Dashboard  │   │   Routes   │
       └────────────┘   └────────────┘   └────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │       MongoDB        │
                    └──────────────────────┘
```

The backend registers the core API and additional routers for dashboard, efficiency, and invoicing functionality.

Optional services, including Firebase, PostHog, and email delivery providers, operate according to their configuration.

---

## Repository Structure

```text
pmt-work-management/
├── backend/
│   ├── server.py              # app setup, core routes, router registration
│   ├── planning.py            # WhatsApp tasks → Planning page and task cards
│   ├── approvals.py, approval_helpers.py
│   ├── deliverables.py, deliverable_import.py, project_*.py
│   ├── work_items_routes.py, work_items_rules.py, project_tasks.py
│   ├── efficiency.py, invoicing.py, home_dashboard.py, home_monthly.py
│   ├── meetings.py            # Google Calendar sync
│   ├── premium_sheet_sync.py  # Premium Content sheet → PMT
│   ├── notifications.py, notification_routes.py
│   ├── security.py, auth_routes.py, users.py, clients.py
│   ├── requirements.txt, .env.example
│   └── tests/
│
├── frontend/
│   ├── api/                   # Vercel functions for project-share cards
│   ├── vercel.json
│   ├── package.json, craco.config.js
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── pages/
│       ├── components/
│       ├── demo/              # /demo mode with in-browser sample data
│       ├── context/, hooks/, lib/, services/
│
├── docs/                      # calendar setup, project sharing, WhatsApp integration
├── integrations/              # Apps Script for the Premium Content sheet
├── portfolio-video/           # product film and render tools
├── tests/                     # sheet-sync test
├── memory/PRD.md              # product requirements notes
├── import_projects_sheet.mongosh.js, backfill_management_stakeholders.mongosh.js
└── README.md
```

This is a high-level representation of the repository. Additional files and modules may exist as development continues.

### Important Files

| File | Responsibility |
|---|---|
| `backend/server.py` | Main FastAPI application and core API |
| `backend/planning.py` | Planning overview, task cards, held-item review, learned rules |
| `backend/approvals.py` | Review queue, approval board, approve / move / hide |
| `backend/efficiency.py` | Efficiency and capacity APIs |
| `backend/home_dashboard.py`, `backend/home_monthly.py` | Home dashboard and the 12-month chart |
| `backend/invoicing.py` | Invoicing functionality |
| `backend/meetings.py` | Google Calendar sync and Meetings API |
| `backend/premium_sheet_sync.py` | Premium Content sheet sync |
| `backend/project_share.py` | Shareable project links and preview cards |
| `backend/project_tasks.py` | Projects-team follow-up sheet |
| `backend/work_items_rules.py` | Work Sheet validation and role-based edit limits |
| `backend/deliverable_import.py` | Deliverable import functionality |
| `backend/project_duplicates.py` | Project duplicate detection |
| `frontend/src/App.js` | Frontend application and routing |
| `frontend/src/services/api.js` | Main frontend API client |
| `frontend/src/services/planningApi.js` | Planning API helpers |
| `frontend/src/pages/WorkSheetPage.jsx` | Worksheet interface |
| `frontend/src/pages/ProjectsPage.jsx` | Projects interface |
| `frontend/src/pages/ProjectDetailPage.jsx` | Project details interface |

---

## Prerequisites

Install the following before running the application locally:

- Git
- Node.js and npm compatible with the frontend dependencies
- Python 3.13, as referenced by the backend dependency configuration
- Access to MongoDB, either locally or through MongoDB Atlas
- A configured application environment

Optional integrations require their corresponding Firebase, PostHog, or email-provider configuration.

Check the dependency files before selecting or upgrading runtime versions.

---

## Local Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/bhashwatipyne-droid/pmt-work-management.git
cd pmt-work-management
```

### 2. Configure the Backend

Create the local environment file:

```bash
cp backend/.env.example backend/.env
```

Add the required configuration to `backend/.env`.

At minimum, the backend requires:

- `MONGO_URL`
- `DB_NAME`
- `JWT_SECRET`

Use credentials belonging to your own development environment.

### 3. Create the Python Environment

On macOS or Linux:

```bash
cd backend

python3.13 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Start the backend:

```bash
uvicorn server:app --reload --host 127.0.0.1 --port 8000
```

The backend should normally be available at:

`http://127.0.0.1:8000`

FastAPI's interactive documentation is usually available at:

`http://127.0.0.1:8000/docs`

On Windows PowerShell, create and activate the environment with:

```powershell
cd backend

py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
pip install -r requirements.txt
```

Then start Uvicorn using the same command shown above.

If you start the application from the repository root, the appropriate import path may instead be:

```bash
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
```

Use the startup command that matches the backend's import structure and working directory.

### 4. Configure the Frontend

Open a second terminal:

```bash
cd frontend
```

Create `frontend/.env` and configure the backend URL:

```dotenv
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
```

Install dependencies:

```bash
npm install
```

Start the frontend:

```bash
npm start
```

The frontend development server normally opens at:

`http://localhost:3000`

Keep the backend running in the first terminal.

### 5. Verify the Application

Confirm that:

1. MongoDB is accessible.
2. The backend starts without configuration errors.
3. The frontend starts successfully.
4. `REACT_APP_BACKEND_URL` points to the running backend.
5. You can sign in using a valid configured account.
6. API requests succeed in the browser's Network tab.

If the frontend and backend use different origins, verify the backend's CORS configuration.

---

## Environment Variables

The following variables are referenced by the application or its integrations. Actual requirements depend on the features being used and the deployment configuration.

### Backend Variables

Configure these in `backend/.env` locally or through the hosting provider's environment settings.

| Variable | Purpose |
|---|---|
| `MONGO_URL` | MongoDB connection URI |
| `DB_NAME` | MongoDB database name |
| `JWT_SECRET` | Secret used for JWT signing and verification |
| `MONGO_MIN_POOL_SIZE` | Optional minimum database connection pool size |
| `MONGO_MAX_POOL_SIZE` | Optional maximum database connection pool size |
| `CORS_ORIGINS` | Allowed frontend origins |
| `FRONTEND_URL` | Public frontend URL for password-reset links |
| `BREVO_API_KEY` | Optional Brevo email-provider API key |
| `EMAIL_FROM` | Sender identity for Brevo email |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | SMTP server port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASSWORD` | SMTP password or app password |
| `SMTP_FROM` | SMTP sender identity |
| `SMTP_STARTTLS` | SMTP STARTTLS configuration |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Optional Firebase service-account configuration |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Optional Firebase service-account file path |
| `READ_CACHE_SECONDS` | Short-lived cache for polled read endpoints and heavy dashboard reads, dropped on every write; default 30, `0` turns it off |
| `LOGIN_MAX_FAILS_PER_IP`, `LOGIN_MAX_FAILS_PER_LOGIN`, `LOGIN_FAIL_WINDOW_SECONDS` | Login throttling limits |
| `REVIEW_AUTO_CLOSE_HOURS` | Work Sheet rows waiting for a manager's review longer than this are approved automatically by the system (rows assigned to admins are not touched); default 24, `0` turns it off |
| `STALE_ROW_AUTO_CLOSE_HOURS` | Open Work Sheet rows untouched for this long are closed by a background sweep, except On Hold rows; default 2, `0` turns it off |
| `MGMT_TASK_AUTO_CLOSE_HOURS` | Open Projects-team tasks untouched for this long are marked Done; any edit restarts the clock; default 48, `0` turns it off |
| `PLANNING_AUTO_ACCEPT_MINUTES` | Minutes before an unanswered task card is accepted for the person; default 60, `0` disables |
| `PLANNING_DEFAULT_ESTIMATE_MINUTES` | Estimate given to every WhatsApp task until changed; default 60 |
| `PLANNING_HOLIDAYS` | Days nobody is planned for, for example `2026-11-08:Diwali,2026-12-25:Christmas` |
| `NOTIFICATION_SCAN_INTERVAL_MINUTES` | How often overdue and reminder notices are created; default 360 |
| `CALENDAR_IDS` | Calendars shown on the Meetings page |
| `CALENDAR_SYNC_MINUTES` | Calendar sync interval; default 10 |
| `GOOGLE_CALENDAR_SERVICE_ACCOUNT` | Service-account credentials for the Calendar API; when unset, calendar sync is off |
| `CALENDAR_ICAL_URLS` | Optional, no Google Cloud needed: comma-separated `mailbox=iCal-link` pairs |
| `SHEET_SYNC_TOKEN` | Shared secret the Premium Content Apps Script sends as `X-Sync-Token` |
| `PREMIUM_SHEET_CLIENT_NAME` | Client the monthly Premium projects belong to; default `Thefinpedia` |
| `PREMIUM_SHEET_FROM_MONTH` | First month synced from the sheet; default `2026-10` |
| `PUBLIC_API_URL` | Optional public https address of this API, used for Google's calendar change notifications; defaults to `RENDER_EXTERNAL_URL` |
| `RENDER_EXTERNAL_URL` | Set by Render; the fallback for `PUBLIC_API_URL` |

`MONGO_URL` and `DB_NAME` are the names this backend reads; the WhatsApp listener repository uses `MONGODB_URI` and `MONGODB_DB` for the same cluster and database.

Database connection strings, JWT secrets, email passwords, and service-account credentials must remain private.

### Frontend Variables

Configure these in `frontend/.env` when the corresponding features are enabled.

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Backend API base URL |
| `REACT_APP_FIREBASE_API_KEY` | Firebase client configuration |
| `REACT_APP_FIREBASE_APP_ID` | Firebase application ID |
| `REACT_APP_FIREBASE_AUTH_DOMAIN` | Firebase authentication domain |
| `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `REACT_APP_FIREBASE_PROJECT_ID` | Firebase project ID |
| `REACT_APP_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `REACT_APP_FIREBASE_VAPID_KEY` | Browser push-notification public key |
| `REACT_APP_POSTHOG_KEY` | Optional PostHog project key |
| `REACT_APP_POSTHOG_HOST` | Optional PostHog host |
| `REACT_APP_TASK_CARDS_DISABLED` | Task-card feature flag |
| `BACKEND_URL` | Read by the Vercel functions in `frontend/api/` (project-share cards); falls back to `REACT_APP_BACKEND_URL` |

`PUBLIC_URL` may also be used for frontend asset paths.

**Important:** Variables prefixed with `REACT_APP_` are embedded in the frontend build. Never put private server credentials, database passwords, or JWT secrets in frontend environment variables.

Restart the frontend development server after changing its environment configuration.

---

## Database Model and Conventions

PMT uses MongoDB collections. The schema may evolve as features are added, so inspect the relevant backend endpoint before modifying fields or relationships.

Common collections referenced by the backend include:

- `users`
- `clients`
- `projects`
- `deliverables`
- `work_items`
- `notifications`
- `push_tokens`
- `approval_workflows`
- `approval_items`
- `approval_history`
- `tasklist_items`, `nlp_match_logs`, `nlp_learned_rules` (written by the WhatsApp listener; PMT serves and moves them, and changes only `disabled` on learned rules)
- `calendar_events` (the Meetings page's copy of Google Calendar)
- `efficiency_capacity`, `efficiency_employee_targets`

### Application IDs vs. MongoDB ObjectIds

The application commonly uses a string field named `id` to identify records. MongoDB also maintains its own `_id` field.

For example:

```json
{
  "id": "PROJECT - 819",
  "name": "ABSL - SPL Campaign"
}
```

Deliverables associated with this project may reference the application's project ID through `project_id`:

```json
{
  "id": "DELIVERABLE - 4014",
  "project_id": "PROJECT - 819",
  "current_stage": "Content",
  "stage_status": "Not Started"
}
```

These are illustrative examples of the field conventions used in the application.

When querying MongoDB Compass, use the field expected by the backend:

```json
{
  "id": "PROJECT - 819"
}
```

To retrieve deliverables associated with that project:

```json
{
  "project_id": "PROJECT - 819"
}
```

Do not assume MongoDB's `_id` and the application's string `id` are interchangeable.

### Project and Deliverable Statuses

Keep these concepts separate:

- **Project status:** Describes the lifecycle of a project.
- **`current_stage`:** Describes the workflow stage of a deliverable.
- **`stage_status`:** Describes the deliverable's status within its workflow.

Example values include:

| Field | Example values |
|---|---|
| Project status | `Active` |
| Deliverable stage | `Content`, `Design`, `Animate`, `Finish` |
| Deliverable stage status | `Not Started`, `Closed` |

Legacy or imported data may contain stage values that are not represented in every current UI view.

When changing stage lists, grouping logic, or progress calculations:

1. Confirm which stage values exist in MongoDB.
2. Ensure every deliverable remains visible or is deliberately mapped.
3. Reconcile the displayed counts with the underlying records.
4. Preserve historical records and status information.
5. Use a reviewed migration if data changes are genuinely necessary.

### Dates and Legacy Data

Imported records may have missing date fields or dates stored as strings in different formats.

Before changing date filters, verify:

- How dates are stored in MongoDB.
- How the backend parses and filters those dates.
- Whether the frontend applies additional filtering.
- Whether records with missing dates should remain visible.

Do not assume that a missing start date or end date means a record should be excluded.

### Startup Migrations and Indexes

The backend startup process performs selected migrations and creates indexes for common lookups and list views.

Review `run_startup_migrations()` in `backend/server.py` before changing startup behavior.

Migrations should be safe to run repeatedly and should account for older or incompletely normalized records.

---

## API Structure

The main API implementation is in `backend/server.py`.

Additional functionality is organized into separate modules:

| Module | Responsibility |
|---|---|
| `backend/server.py` | Core application routes and shared backend functionality |
| `backend/home_dashboard.py`, `backend/home_monthly.py` | Home dashboard endpoints |
| `backend/efficiency.py` | Efficiency and capacity endpoints (`/api/efficiency`) |
| `backend/invoicing.py` | Invoicing endpoints (`/api/invoicing`) |
| `backend/planning.py` | Planning, task cards, held-item review, learned rules (`/api/planning`) |
| `backend/approvals.py` | Review queue and approvals (`/api/approvals`, `/api/bulk-review`, `/api/approval-items/...`) |
| `backend/meetings.py` | Calendar events and the Google change webhook (`/api/meetings`) |
| `backend/project_tasks.py` | Projects-team follow-up tasks (`/api/project-tasks`) |
| `backend/project_share.py` | Share links (`/api/projects/{id}/share`, `/api/share/p/{token}`) |
| `backend/premium_sheet_sync.py` | Sheet sync (`POST /api/integrations/premium-sheet/sync`) |
| `backend/deliverable_import.py` | Deliverable import functionality |
| `backend/project_duplicates.py` | Project duplicate detection |
| `frontend/src/services/api.js` | Main frontend API client |
| `frontend/src/services/planningApi.js` | Planning API helpers |

The core backend router uses the `/api` prefix.

For the definitive list of endpoints and request/response schemas, use the running API's `/docs` page and inspect the corresponding route implementation.

Avoid relying on undocumented assumptions about endpoint behavior.

---

## Testing and Quality Checks

### Backend Tests

Backend tests are located under `backend/tests/`.

From the repository root:

```bash
python -m pytest backend/tests -q
```

Alternatively, from the backend directory:

```bash
python -m pytest tests -q
```

The suite (33 test files under `backend/tests/`) covers areas such as authentication and login throttling, permissions, Work Sheet rules, approvals, dashboards and the monthly chart, efficiency, invoicing, meetings, project sharing and duplicates, planning and tasklist items, notifications, and startup. The Premium Content sheet sync has its own test in `tests/test_premium_sheet_sync.py` at the repository root.

Check `backend/pytest.ini` for project-specific test configuration.

### Frontend Tests

From the frontend directory:

```bash
npm test
```

There are 41 frontend test files, covering pages, the Work Sheet helpers in `src/lib/`, planning logic, and the demo server in `src/demo/`.

### Production Build

From the frontend directory:

```bash
npm run build
```

Before pushing a change:

- Run relevant backend tests.
- Build the frontend.
- Test the affected feature manually.
- Verify database behavior where applicable.
- Review the Git diff.

A successful frontend build does not guarantee that backend integration, production configuration, or database data is correct.

---

## Deployment

The frontend and backend can be deployed separately.

### Backend Deployment

1. Install dependencies from `backend/requirements.txt`.
2. Configure MongoDB and required environment variables.
3. Configure CORS and security settings.
4. Start the FastAPI application with Uvicorn.
5. Confirm the service can connect to MongoDB.

A typical start command, when the application is launched from the repository root, is:

```bash
uvicorn backend.server:app --host 0.0.0.0 --port $PORT
```

The hosting provider must supply the appropriate port variable. If the service starts from `backend/`, the import path may instead be `server:app`.

Verify the working directory and import path for the selected hosting environment.

### Frontend Deployment

1. Install dependencies from `frontend/package.json`.
2. Configure `REACT_APP_BACKEND_URL`.
3. Add optional client integrations if required.
4. Run the production build.
5. Deploy the generated frontend assets using the configured hosting platform.

The frontend is deployed on Vercel. `frontend/vercel.json` rewrites `/share/:token` to the `api/share-preview` function (so shared project links unfurl in WhatsApp) and sends every other path to `index.html`, which also serves `/demo`. The backend is deployed on Render.

### Connected Services

After a deployment, check the services that talk to PMT:

- **WhatsApp listener** (`task_assignment_automation`): uses the same MongoDB cluster and database as this backend. Point its `OUTBOX_DIR` at a persistent disk if you want queued tasks to survive a redeploy.
- **Premium Content sheet:** the Apps Script's `PMT_URL` must be the backend's `/api` address and its `SYNC_TOKEN` must equal `SHEET_SYNC_TOKEN` on the backend.
- **Google Calendar:** `GOOGLE_CALENDAR_SERVICE_ACCOUNT` and `CALENDAR_IDS` are set, or Meetings stays empty.

### Production Checklist

- Configure all required environment variables.
- Use a strong, unique JWT secret.
- Restrict MongoDB network access.
- Use the correct frontend and backend URLs.
- Set `CORS_ORIGINS` to the intended frontend origin or origins.
- Keep all private credentials in hosting-provider secrets.
- Verify login, projects, deliverables, worksheet logging, approvals, efficiency, and invoicing after deployment.

Exact build and deployment settings depend on the hosting platform and should be maintained in its configuration.

---

## Troubleshooting

### Backend Fails to Start

- Confirm `backend/.env` exists locally.
- Verify `MONGO_URL`, `DB_NAME`, and `JWT_SECRET`.
- Confirm dependencies are installed.
- Check the current working directory and Uvicorn import path.
- Inspect backend logs for the actual error.

### MongoDB Connection Fails

- Verify the MongoDB URI and database name.
- Confirm Atlas network access permits the current IP or hosting service.
- Check database-user permissions.
- Never share database credentials in screenshots, issues, or public logs.

### Frontend Requests Fail or Show a CORS Error

- Confirm `REACT_APP_BACKEND_URL` points to the running backend.
- Verify `CORS_ORIGINS` includes the frontend origin.
- Restart the frontend after changing environment variables.
- Inspect the browser Network tab and backend logs.

### Frontend Reports a Missing Package or Command

Run frontend commands from the `frontend/` directory:

```bash
cd frontend
npm install
npm start
```

Check that the installed Node.js version is compatible with the dependencies.

### Project Detail Page Shows Fewer Deliverables Than the Total

If the total count is higher than the number of visible deliverables, compare the summary count with the actual MongoDB records.

For example, in MongoDB Compass:

```json
{
  "project_id": "PROJECT - 819"
}
```

Inspect fields such as:

- `current_stage`
- `stage_status`
- `start_dt`
- `end_dt`
- Any visibility or filtering fields used by the page

A known legacy-data case includes deliverables with:

```json
{
  "current_stage": "Finish",
  "stage_status": "Closed"
}
```

If the frontend renders only the `Content`, `Design`, and `Animate` groups, ensure legacy `Finish` deliverables remain visible or are deliberately mapped into the current UI.

Do not modify database records merely to make them appear in the interface.

### Dashboard Count Differs From Table Count

A summary card may count every associated record, while the table applies additional filtering based on stage, status, dates, permissions, search terms, or visibility.

Trace the calculation for each value separately and make the intended inclusion rules explicit.

Test records covering active, completed, legacy-stage, missing-date, and hidden cases.

### Password-Reset Emails Do Not Send

- Configure either Brevo or SMTP.
- Verify the sender identity with the provider.
- Check the provider's logs.
- Set `FRONTEND_URL` to the correct public frontend URL.

---

## Development Workflow

A recommended development workflow:

1. Pull the latest changes before starting work.
2. Create a focused branch for the feature or bug fix.
3. Reproduce the issue before modifying code.
4. Identify the owning frontend component, backend route, and data fields.
5. Implement the smallest maintainable change.
6. Add a regression test where practical.
7. Test edge cases, especially legacy records and incomplete data.
8. Run the relevant backend tests and frontend build.
9. Review the Git diff.
10. Commit with a clear message and open a pull request for review.

### Git Commands

Check the current working tree:

```bash
git status
```

Review the changes:

```bash
git diff
```

Stage the intended files:

```bash
git add <file-or-directory>
```

Commit:

```bash
git commit -m "Describe the change"
```

Push the current branch:

```bash
git push origin <branch-name>
```

Avoid staging secrets, database exports, customer data, or unrelated local files.

---

## Database Safety Checklist

Before performing a bulk update or migration:

1. Export or snapshot the affected data.
2. Run a read-only query first.
3. Verify the number of matching records.
4. Test the change on a small sample or non-production database.
5. Make the migration idempotent where possible.
6. Verify counts and representative records afterward.
7. Record the reason for the schema or lifecycle change.

Do not perform broad production updates merely to resolve a UI display problem.

---

## Security Guidelines

- Never commit `.env` files, passwords, API tokens, private keys, or service-account JSON.
- Never commit production database exports or customer data.
- Use strong, unique database credentials and JWT secrets.
- Restrict database network access.
- Configure CORS explicitly for production.
- Avoid logging credentials, tokens, or sensitive customer information.
- Validate permissions in backend APIs; hiding a frontend button is not a substitute for backend authorization.

---

## Contributing

When reporting a bug or submitting a change, include:

- The affected module or page.
- Steps to reproduce the issue.
- Expected versus actual behavior.
- Relevant screenshots or sanitized logs, where helpful.
- Tests or verification steps.
- Any impact on database schema, migrations, or environment variables.

Keep changes focused and preserve existing application behavior unless a deliberate change is intended.

---

## License

Add the project's license here when one has been selected.

Until a license is included in the repository, do not assume the code is available for unrestricted reuse.
