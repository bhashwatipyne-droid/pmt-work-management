# WhatsApp tasklists → Planning & Task cards

## Flow

```
TL posts tasklist in WhatsApp group
  → listener (Baileys) parses it into lines, one task each
  → existing NLP matcher (lexicon.json) → client / project / deliverable + scores
  → mongoStore re-checks the matched ids against live Mongo (hidden, merged, moved, missing)
  → tasklist_items  (status: pending | needs_review)      + nlp_match_logs (scores, runners-up)
  → PMT  GET /api/planning/my-tasks      → "Task assigned to you" card for the assignee
  → Accept → create_work_item() → row in that member's Work Sheet (work_items, source=whatsapp_task)
  → PMT  GET /api/planning/overview      → Planning page (managers/admin)
```

Ambiguous or unmatched lines are **never assigned**: they get `status: needs_review` with the reasons,
and show up in `GET /api/planning/review` until a manager resolves or rejects them.

## Collections (all in the existing `pmt` database)

| Collection | Written by | Purpose |
|---|---|---|
| `whatsapp_messages`, `whatsapp_tasklists` | listener | raw message + parsed tasklist, idempotent on message id |
| `tasklist_items` | listener (create), PMT (accept/decline/reassign/resolve) | the PMT-facing task record |
| `nlp_match_logs` | listener; PMT adds `human_resolution` | per-line scores, margins, alternatives, decision |
| `work_items` | PMT `create_work_item` | the member's Work Sheet row (tagged `source_task_id`) |
| `tasks` | listener, only if `WRITE_TASKS=true` | legacy, off |

Existing `clients`, `projects`, `deliverables`, `work_items`, `users` are only read (or, for `work_items`, written
through the existing `create_work_item`). Nothing is migrated or rewritten.

## Assignee resolution

- A full name or username in the tasklist (e.g. `Bhashwati Testing`) is an exact match and is accepted for **every** PMT account, test accounts included.
- A bare first name (`Ratnesh`) prefers real accounts over test accounts, and falls back to a test account only if no real one shares the name.
- A name that exists only in another department goes to review rather than being guessed. Content, Design and Animation tasklists are recognised.
- The listener builds its known-name list from the live `users` collection, the bundled `teamRoster.json` (in the task_assignment_automation repo) and the optional `ASSIGNEES` env var, so `ASSIGNEES` no longer has to list everyone.

## Duplicates, failures, retries

- Re-delivered message: upserts with `$setOnInsert`; an already accepted item is never overwritten; `nlp_match_logs.seen_count` increments.
- Same task posted twice the same day: per-line `dedupe_key = sha1(workDate|assignee|normalised line)`.
- Mongo down: listener writes to a local `outbox/` and retries (`flushOutbox`).
- Double click on Accept: claim `pending → accepting`, and `work_items.source_task_id` is reused, so one row only.
- Project hidden/merged/changed between ingest and accept: 409, task stays pending.

## Configuration

Listener (`.env`, see `.env.example`): `MONGODB_URI`, `MONGODB_DB=pmt`, `MANAGER_MAP`, `ALLOWED_GROUP_NAMES`, `DRY_RUN`.
Backend: no new variables. Optional `PLANNING_DEFAULT_ESTIMATE_MINUTES` (default 60).
Frontend: none. `REACT_APP_TASK_CARDS_DISABLED=true` hides the cards.

The lexicon (`lexicon.json`) is a snapshot. Rebuild it (`node build-lexicon.js`) when clients/projects/deliverables change;
until then ingest-time validation catches ids that no longer exist.

## Verify end to end

1. `cd listener && npm install && npm test` (35 tests).
2. `cd backend && pytest tests/test_planning_integration.py -n 0` (35 tests; uses mongomock, no Atlas needed).
3. `cd frontend && CI=true yarn test --watchAll=false` (9 tests).
4. Dry run: set `DRY_RUN=true`, start the listener, post a tasklist in an allowed group; the console prints the items and logs.
5. Real run: `DRY_RUN=false`, post the tasklist again. In mongosh:
   `db.tasklist_items.find({}, {assignee_pmt_name:1, project_name:1, status:1, review_reasons:1})`
6. Log in to PMT as the assignee: the card appears. Accept → open **Work Sheet**: the row is at the top.
7. Log in as the manager: **Planning** shows the task (marked "not accepted yet" until accepted).

## Observability (NLP scores)

```js
// lowest-confidence decisions in the last week
db.nlp_match_logs.find({ decision: "needs_review" }).sort({ created_at: -1 })
// close calls that were still queued
db.nlp_match_logs.find({ decision: "queued", "margin.project": { $lt: 0.15 } })
// how often did humans change the NLP choice?
db.nlp_match_logs.aggregate([{ $group: { _id: "$human_resolution.outcome", n: { $sum: 1 } } }])
```

The matcher is score-based, so the log stores raw scores, the #1–#2 margin and the runner-up alternatives (not statistical confidence intervals).

## Manual Work Sheet rows on the Planning page

The Work Sheet has a second way in besides WhatsApp: rows people type in themselves. Those are plan too.
`/api/planning/overview` (the Gantt, workload and suggestions) draws both kinds side by side:

| Source | Where it comes from | Marked |
|---|---|---|
| WhatsApp task | `tasklist_items` (pending or accepted) | no `src` key |
| Typed into the Work Sheet | `work_items` with no `source_task_id` | `src: "worksheet"`, note "Logged <day>" |

A typed row is included when it has an owner, a valid work date in the window (last two weeks to the end of
this week), is not `Scrap`, and names something (deliverable name, type, deliverable or project). Blank rows
are ignored. Its Work Sheet status is its plan status (Closed = done, Ongoing / Ready for Review / ... = in
progress, Not Started = to do), the time logged on it is its estimate (60 min if none), and an unfinished row
from an earlier day is "rolled over" like a late task. Rows accepted from a WhatsApp task have a
`source_task_id` and are not counted twice. Only people on the Planning team list (members and managers of
Content / Design / Animation, no test accounts) appear, and a manager sees their own team.

On the Planning tiles, WhatsApp tasks are "Assigned" (`cat: new`) and typed rows are "Extra work"
(`cat: planned`), because assignment only happens through WhatsApp; late unfinished work of either kind is
"Rolled over / delayed".

Today's typed rows also count toward the "load" shown on a task card. They cannot be reassigned from Planning
(the person logged them themselves), so they are never offered as a "Move this task" suggestion.

## Known gaps

- No review-queue screen yet (API only: `/api/planning/review`, `/resolve`, `/reject`).
- Planning "on-time %, feedback, revisions" are still placeholders (no data source).
- Estimate and quantity are not in tasklists: default 60 min, quantity "—".
- WhatsApp message edits are not handled.
