# PMT — Project & Work Management

A web-based project, production, and team-work management application for coordinating projects, deliverables, approvals, work logs, capacity, efficiency, planning, and invoicing in one workspace.

PMT brings project execution and operational visibility into a centralized application, helping teams manage work from planning through delivery and review.

---

## Table of Contents

- [Overview](#overview)
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

Optional integrations support product analytics, push notifications, and email delivery.

## Core Modules

### 1. Dashboard

Provides a high-level overview of project and production activity.

Key capabilities include:

- Project and deliverable summaries.
- Approval and work-status visibility.
- Key performance indicators.
- Team activity and operational reporting.

Dashboard APIs are implemented in `backend/home_dashboard.py`.

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
- Filter worksheet records.
- Support task-level review and approval workflows.
- Maintain work history where supported by the implementation.

Primary frontend file:

`frontend/src/pages/WorkSheetPage.jsx`

Additional worksheet rules and helpers are located in `frontend/src/lib/`.

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

Provides planning and task-dashboard functionality, including timeline-related views.

Relevant files:

- `frontend/src/pages/PlanningPage.jsx`
- `frontend/src/services/planningApi.js`

Some planning capabilities may depend on backend integration and deployment configuration. Verify the current implementation before assuming all planning features are fully connected.

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
Pmt-main/
├── backend/
│   ├── server.py
│   ├── efficiency.py
│   ├── home_dashboard.py
│   ├── invoicing.py
│   ├── deliverable_import.py
│   ├── project_duplicates.py
│   ├── requirements.txt
│   ├── .env.example
│   └── tests/
│
├── frontend/
│   ├── package.json
│   ├── craco.config.js
│   ├── public/
│   └── src/
│       ├── App.js
│       ├── pages/
│       ├── components/
│       ├── context/
│       ├── hooks/
│       ├── lib/
│       └── services/
│
└── README.md
```

This is a high-level representation of the repository. Additional files and modules may exist as development continues.

### Important Files

| File | Responsibility |
|---|---|
| `backend/server.py` | Main FastAPI application and core API |
| `backend/efficiency.py` | Efficiency and capacity APIs |
| `backend/home_dashboard.py` | Dashboard endpoints |
| `backend/invoicing.py` | Invoicing functionality |
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
git clone <YOUR_REPOSITORY_URL>
cd Pmt-main
```

Replace `<YOUR_REPOSITORY_URL>` with the actual GitHub repository URL.

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
| `backend/home_dashboard.py` | Dashboard endpoints |
| `backend/efficiency.py` | Efficiency and capacity endpoints |
| `backend/invoicing.py` | Invoicing endpoints |
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

The test suite covers areas such as authentication, permissions, worksheet behavior, dashboard actions, role handling, and project duplicate handling.

Check `backend/pytest.ini` for project-specific test configuration.

### Frontend Tests

From the frontend directory:

```bash
npm test
```

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
