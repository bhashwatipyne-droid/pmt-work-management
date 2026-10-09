PMT — Project & Work Management
A web-based project, production, and team-work management application for coordinating projects, deliverables, approvals, work logs, capacity, efficiency, planning, and invoicing in one workspace.
Repository note: This README documents the application structure and setup based on the current codebase. Environment-specific credentials, production URLs, and deployment secrets must be supplied by the maintainer and must never be committed to Git.

Contents
- Overview
- Core modules
- Technology stack
- Architecture
- Repository structure
- Prerequisites
- Local development setup
- Environment variables
- Data model and important conventions
- API and service layout
- Testing and quality checks
- Deployment notes
- Troubleshooting
- Safe development workflow
Overview
PMT centralizes the work involved in taking a project from planning through production and review. It provides project and deliverable tracking, a worksheet for logging work, approval workflows, team and client administration, efficiency reporting, planning, and invoicing.
The application is split into two main applications:
- Frontend: React single-page application, located in frontend/.
- Backend: FastAPI service, located in backend/, using MongoDB for persistence.
The frontend communicates with the backend over HTTP. Authentication and access checks are handled by the application; Firebase is used for supporting services such as push notifications, and PostHog can be enabled for product analytics.
Core modules
Home and dashboard
- Summary views for projects, deliverables, approvals, and team activity.
- Attention panels and KPI cards for work that may need action.
- Dashboard APIs are separated into backend/home_dashboard.py.
Projects and deliverables
- Create and update projects, assign clients and points of contact, and set project dates and status.
- Add, edit, and import deliverables associated with a project.
- Review deliverables by production stage, view status and schedule information, and inspect project work logs.
- List and Kanban-style project views, project filtering, and bulk project actions.
- Project-related UI is primarily in frontend/src/pages/ProjectsPage.jsx, frontend/src/pages/ProjectDetailPage.jsx, and frontend/src/components/projects/.
Worksheet and work logging
- Record work against projects and deliverables.
- Track work date, work type/category, time, ownership, status, and review-related information where applicable.
- Support worksheet filtering and review workflows.
- The main UI is frontend/src/pages/WorkSheetPage.jsx; worksheet rules and helpers are in frontend/src/lib/.
Approvals
- Review work and deliverables through approval workflows.
- Surface work awaiting review and provide reviewer-oriented filtering and actions.
- The main UI is frontend/src/pages/ApprovalsPage.jsx with supporting components in frontend/src/components/approvals/.
Clients and team
- Maintain client records and contact information.
- Manage team members and their application access.
- Relevant pages include ClientsPage.jsx and TeamPage.jsx.
Efficiency and capacity
- View efficiency and activity reporting.
- Configure employee activity targets and monthly capacity.
- Inspect employee-level details and team-level summaries.
- Backend logic is in backend/efficiency.py; frontend pages are under frontend/src/pages/Efficiency* and components under frontend/src/components/efficiency/.
Planning
- Planning/task dashboard and timeline-related functionality.
- The main UI is frontend/src/pages/PlanningPage.jsx, with API helpers in frontend/src/services/planningApi.js.
- Some planning functionality may depend on backend integration and configuration available in the deployment environment.
Invoicing
- Invoice-related workflows and finance views.
- Backend routes and logic are in backend/invoicing.py; the frontend page is frontend/src/pages/InvoicingPage.jsx.
Notifications and supporting services
- In-app notifications and optional browser push notifications.
- Password-reset email support through SMTP or Brevo.
- Optional PostHog analytics integration.
- Relevant frontend code is under frontend/src/components/notifications/, frontend/src/lib/firebase.js, frontend/src/lib/push.js, and frontend/src/analytics.js.
Technology stack
Layer	Technology
Frontend	React 19, React Router, Create React App tooling through CRACO
UI	Tailwind CSS, Radix UI, Lucide React, reusable local components
Data fetching	Axios, TanStack React Query, SWR where used
Charts	Recharts
Backend API	Python, FastAPI, Uvicorn
Database	MongoDB, accessed asynchronously with Motor and PyMongo
Authentication/security	Application-level JWT handling and password hashing; see backend implementation and deployment configuration
Notifications	Firebase Admin / Firebase messaging integration where configured
Product analytics	PostHog JS, optional
Testing	Pytest for backend tests; frontend test script available through CRACO


Exact versions are defined in frontend/package.json and backend/requirements.txt.
Architecture
Browser
  |
  v
React frontend (frontend/)
  |  HTTP requests via frontend/src/services/api.js
  v
FastAPI backend (backend/server.py)
  |-- Core application API (/api/...)
  |-- Home dashboard router
  |-- Efficiency router
  |-- Invoicing router
  |
  v
MongoDB database

Optional integrations:
  - Firebase / push notifications
  - SMTP or Brevo for password-reset email
  - PostHog for product analytics
The backend creates an /api router for core application endpoints and registers additional routers for home dashboard, efficiency, and invoicing functionality. MongoDB collection names are used directly in backend code; inspect the corresponding endpoint before changing a collection or field convention.
Repository structure
.
├── backend/
│   ├── server.py                 # Main FastAPI app and core API
│   ├── efficiency.py             # Efficiency and capacity APIs
│   ├── home_dashboard.py         # Home/dashboard APIs
│   ├── invoicing.py              # Invoicing APIs
│   ├── deliverable_import.py     # Deliverable import helpers/endpoints
│   ├── project_duplicates.py     # Project duplicate detection helpers
│   ├── requirements.txt          # Pinned Python dependencies
│   ├── .env.example              # Example email configuration
│   └── tests/                    # Backend tests
└── frontend/
    ├── package.json              # Frontend dependencies and scripts
    ├── craco.config.js           # CRA customization
    ├── public/                   # Static assets and service worker
    └── src/
        ├── App.js                # Routes and application shell
        ├── pages/                # Main application pages
        ├── components/           # Feature-specific and shared UI
        ├── context/              # React contexts, including user context
        ├── hooks/                # Shared React hooks
        ├── lib/                  # Business rules and utilities
        └── services/             # Backend API clients
Prerequisites
Install the following before running the application locally:
- Node.js and npm compatible with the frontend dependencies. Use the Node version adopted by your team/deployment environment.
- Python 3.13 is the version referenced by the pinned backend dependency lock file.
- MongoDB access: a local MongoDB instance or a MongoDB Atlas connection string.
- Git and a terminal.
- Optional: Firebase project credentials, PostHog project credentials, and email-provider credentials if you want to exercise those integrations locally.
You need valid application configuration and database access before the backend can start. Do not use production credentials in a local .env file unless your organization's policy explicitly permits it.
Local development setup
1. Clone the repository
git clone <YOUR_REPOSITORY_URL>
cd <REPOSITORY_DIRECTORY>
Replace the placeholders with your GitHub repository URL and local directory name.
2. Configure the backend
Create a local environment file:
cp backend/.env.example backend/.env
Add the required database and security settings to backend/.env (see Environment variables). At minimum, the backend requires MONGO_URL, DB_NAME, and JWT_SECRET.
Install Python dependencies and start the API:
cd backend
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn server:app --reload --host 127.0.0.1 --port 8000
The API will normally be available at http://127.0.0.1:8000. FastAPI's interactive API documentation is usually available at http://127.0.0.1:8000/docs when enabled by the app.
On Windows PowerShell, create and activate the environment with:
cd backend
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn server:app --reload --host 127.0.0.1 --port 8000
If starting Uvicorn from the repository root instead, use the package path supported by the backend imports:
uvicorn backend.server:app --reload --host 127.0.0.1 --port 8000
3. Configure and start the frontend
In a second terminal:
cd frontend
Create frontend/.env and configure the backend URL:
REACT_APP_BACKEND_URL=http://127.0.0.1:8000
Add optional Firebase and PostHog variables only if you have the corresponding project configuration. Install dependencies and run the frontend:
npm install
npm start
The frontend development server normally opens at http://localhost:3000.
Important: React environment variables are embedded into the frontend build. Never put private keys, database credentials, JWT signing secrets, or other server-only secrets in frontend/.env or any REACT_APP_* variable.

4. Verify the connection
1. Confirm the backend starts without MongoDB connection or missing-environment-variable errors.
2. Confirm the frontend starts and REACT_APP_BACKEND_URL points to the backend URL.
3. Open the application and sign in with a valid configured user account.
4. If requests fail, inspect the browser Network tab and backend logs. Check CORS settings if the frontend and backend use different origins.
Environment variables
The backend reads backend/.env through python-dotenv. Hosting environments can supply the same values as environment variables. The following variables are used by the current codebase or its frontend integrations.
Backend
Variable	Required	Purpose
MONGO_URL	Yes	MongoDB connection URI. Treat as a secret.
DB_NAME	Yes	MongoDB database name.
JWT_SECRET	Yes	Secret used to sign and verify application JWTs. Use a strong, unique value.
MONGO_MIN_POOL_SIZE	No	MongoDB minimum connection pool size; code default is 5.
MONGO_MAX_POOL_SIZE	No	MongoDB maximum connection pool size; code default is 50.
CORS_ORIGINS	No	Comma-separated allowed frontend origins; code currently defaults to *. Configure explicitly for production.
FRONTEND_URL	Recommended for email	Public frontend URL used to create password-reset links.
BREVO_API_KEY	No	Brevo API key for password-reset email delivery.
EMAIL_FROM	No	Sender identity when using Brevo.
SMTP_HOST	No	SMTP server hostname when using SMTP.
SMTP_PORT	No	SMTP server port; code default is 587.
SMTP_USER	No	SMTP username.
SMTP_PASSWORD	No	SMTP password or provider app password. Treat as a secret.
SMTP_FROM	No	SMTP sender identity.
SMTP_STARTTLS	No	Whether SMTP STARTTLS is enabled; code defaults to enabled unless set to false.
FIREBASE_SERVICE_ACCOUNT_JSON	No	Firebase service account JSON for server-side Firebase integration, where configured. Protect it as a secret.
FIREBASE_SERVICE_ACCOUNT_PATH	No	Optional path to a Firebase service account file; verify the exact path handling in backend/server.py for your deployment.


Email delivery can use Brevo or SMTP. Configure the provider you intend to use; don't commit actual credentials.
Frontend
Variable	Required	Purpose
REACT_APP_BACKEND_URL	Yes for a separately hosted API	Base URL for backend API requests.
REACT_APP_FIREBASE_API_KEY	If Firebase client features are enabled	Firebase client configuration.
REACT_APP_FIREBASE_APP_ID	If Firebase client features are enabled	Firebase application ID.
REACT_APP_FIREBASE_AUTH_DOMAIN	If Firebase client features are enabled	Firebase auth domain.
REACT_APP_FIREBASE_MESSAGING_SENDER_ID	If Firebase messaging is enabled	Firebase messaging sender ID.
REACT_APP_FIREBASE_PROJECT_ID	If Firebase client features are enabled	Firebase project ID.
REACT_APP_FIREBASE_STORAGE_BUCKET	If Firebase storage is enabled	Firebase storage bucket.
REACT_APP_FIREBASE_VAPID_KEY	If browser push is enabled	Web Push VAPID public key.
REACT_APP_POSTHOG_KEY	No	PostHog project key.
REACT_APP_POSTHOG_HOST	No	PostHog host/ingestion endpoint.
REACT_APP_TASK_CARDS_DISABLED	No	Frontend feature flag used to disable task cards when set as expected by the implementation.


PUBLIC_URL is also referenced for CRA asset paths and is generally supplied by the build environment when needed.
Data model and important conventions
The application uses MongoDB collections. The exact schema evolves with the codebase, so inspect the endpoint and relevant frontend helper before adding or changing fields.
Common collections referenced by the backend include:
- users
- clients
- projects
- deliverables
- work_items
- notifications
- push_tokens
- approval_workflows
- approval_items
- approval_history
Application IDs versus MongoDB _id
Many lookups use the application's string field id rather than MongoDB's generated _id. Examples include IDs such as PROJECT - 819 or DELIVERABLE - 4014. Related records commonly refer to these application IDs through fields such as project_id and deliverable_id.
When querying MongoDB Compass, use the field and value expected by the code. For example, a project lookup uses:
{
  "id": "PROJECT - 819"
}
Deliverables associated with that project can be found using:
{
  "project_id": "PROJECT - 819"
}
Do not assume the MongoDB ObjectId in _id is interchangeable with the application's string id.
Project and deliverable stages
Project status, deliverable workflow stage, and deliverable status are separate concepts:
- A project's status describes the project lifecycle.
- A deliverable's current_stage describes its workflow stage (for example, Content, Design, Animate, or legacy Finish).
- A deliverable's stage_status describes the state within the workflow (for example, Not Started or Closed).
Legacy/imported data may contain stage values that are not represented in every current UI view. When changing stage lists or progress calculations, make sure every deliverable is still visible and counts reconcile with the database. In particular, don't silently drop records with a legacy or unexpected current_stage value. Preserve existing records and history unless a deliberate, reviewed data migration is required.
Dates and imported data
Some imported legacy records may have empty date fields or date strings with different formats. Check the parsing and filtering rules in the backend and frontend before assuming a missing date means a record should be excluded. Avoid broad database updates without first exporting a backup and testing the filter on a small, known set of records.
Startup indexes and migrations
The backend's startup hook performs selected migrations and creates indexes used by common lookups and list views. Review run_startup_migrations() in backend/server.py before adding a migration or changing index behavior. Startup migrations must be safe to run repeatedly and should not assume every existing record is perfectly normalized.
API and service layout
- backend/server.py: main FastAPI application, core routes, auth helpers, MongoDB client, CORS/GZip middleware, startup migrations and indexes.
- backend/home_dashboard.py: dashboard endpoints.
- backend/efficiency.py: efficiency, activity-target and capacity endpoints.
- backend/invoicing.py: invoicing endpoints.
- backend/deliverable_import.py: deliverable import functionality.
- backend/project_duplicates.py: project duplicate detection helpers.
- frontend/src/services/api.js: main frontend API client.
- frontend/src/services/planningApi.js: planning API helpers.
The core backend router uses the /api prefix. For the definitive endpoint list and request/response schemas, use the running API's /docs page and inspect the corresponding route implementation. This README intentionally does not duplicate every endpoint because route contracts can change as features evolve.
Testing and quality checks
Backend tests
The repository contains tests under backend/tests/. Run them from the repository root with the backend dependencies installed:
python -m pytest backend/tests -q
Or, from backend/:
python -m pytest tests -q
The backend test suite includes coverage for areas such as authentication, permissions, worksheet behavior, dashboard/bulk actions, role handling, and project duplicate handling. Check backend/pytest.ini for repository-specific test settings.
Frontend tests
From frontend/:
npm test
For a production build:
npm run build
Run the relevant checks before pushing changes. A successful frontend build does not verify backend integration, database correctness, or production environment configuration.
Deployment notes
The frontend and backend can be deployed separately. Configure each environment independently:
1. Backend service: install Python dependencies from backend/requirements.txt, configure MongoDB and security/email settings, then run Uvicorn.
2. Frontend service: install dependencies from frontend/package.json, configure REACT_APP_BACKEND_URL and any optional client integrations, then run the production build.
3. CORS: set CORS_ORIGINS to the exact deployed frontend origin(s) instead of relying on a wildcard in production.
4. Secrets: store database URIs, JWT secrets, email credentials, and Firebase service-account data in the hosting provider's secret/environment settings.
5. Database access: restrict MongoDB network access and database permissions to the services and operators that require them.
6. Smoke test: verify sign-in, projects, deliverables, worksheet logging, approvals, and the key reports after deployment.
A typical backend start command is:
uvicorn backend.server:app --host 0.0.0.0 --port $PORT
Use the host platform's required port variable and start command. If the platform starts the process from backend/, uvicorn server:app may be appropriate instead. Confirm the configured working directory and import path for the selected host.
Troubleshooting
Backend fails to start with a missing environment variable
- Confirm backend/.env exists for local development.
- Check that MONGO_URL, DB_NAME, and JWT_SECRET are present.
- Verify that the backend is being started from a path that allows it to load backend/.env and import the sibling modules.
MongoDB connection fails
- Validate the MongoDB URI and database name.
- Confirm Atlas network access rules allow the current IP or hosting service.
- Verify the database user has the required permissions.
- Never paste credentials into an issue, commit, screenshot, or public log.
Frontend requests fail or show a CORS error
- Confirm REACT_APP_BACKEND_URL points to the running backend.
- Confirm CORS_ORIGINS includes the frontend origin exactly, including scheme and port where applicable.
- Restart the frontend after changing environment variables; CRA reads them at startup/build time.
- Inspect the browser Network tab and backend logs for the actual response and request URL.
Frontend reports that a package or command is missing
- Run npm install inside frontend/, not only at the repository root.
- Use the scripts declared in frontend/package.json (npm start, npm test, npm run build).
- Check that the installed Node version is compatible with the project's dependencies.
Project detail page shows fewer deliverables than the total
- Compare the project count in the UI with the records in MongoDB's deliverables collection.
- Query with the application's project ID, for example { "project_id": "PROJECT - 819" }.
- Inspect current_stage, stage_status, and any visibility/filter fields used by the page.
- Legacy deliverables may use current_stage: "Finish" and stage_status: "Closed". If the UI only renders the current Content, Design, and Animate groups, ensure legacy/completed stages are still rendered or deliberately mapped. Don't change database records merely to make the UI display them.
A count differs between a summary card and a table
Trace both values separately. A summary may count all associated records while the table applies stage, status, date, permission, or search filters. Make the intended inclusion rules explicit and test cases with active, completed, legacy-stage, missing-date, and hidden records.
Email/password-reset messages do not send
- Configure either Brevo (BREVO_API_KEY, with sender identity) or SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and sender identity).
- Verify the sender with the provider and check provider logs.
- Set FRONTEND_URL to the public frontend URL so reset links point to the right app.
Safe development workflow
1. Pull the latest changes before starting work.
2. Create a focused branch for a feature or bug fix.
3. Reproduce the issue and identify the owning frontend component, backend route, and data fields.
4. Prefer a minimal fix with a regression test.
5. Test edge cases, especially legacy records and incomplete data.
6. Run the relevant backend tests and frontend build.
7. Review git diff and ensure no .env files, credentials, database exports, or customer data are staged.
8. Commit with a clear message and open a pull request for review.
Database safety checklist
Before a bulk update or migration:
- Export or snapshot the affected data.
- Run a read-only query first and verify the exact matching count.
- Test the migration on a small sample or non-production database.
- Make the operation idempotent where possible.
- Verify counts and representative records after the migration.
- Record the reason for any schema or lifecycle-value change.
Security
- Never commit .env files, secrets, tokens, service-account JSON, or production database exports.
- Use strong, unique JWT and database credentials.
- Restrict CORS and database network access in production.
- Avoid logging passwords, tokens, sensitive customer data, or full connection strings.
- Review permissions on both the API and UI; hiding a button is not a substitute for backend authorization.
Contributing
Bug reports and pull requests should include:
- The affected module/page.
- Reproduction steps and expected versus actual behavior.
- Relevant screenshots or sanitized logs where helpful.
- Test coverage or verification steps.
- Any data migration or environment-variable impact.
License
Add the project's license here if and when one is selected. Until a license is included in the repository, do not assume that the code is open for unrestricted reuse.