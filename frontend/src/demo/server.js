// The demo's stand-in for the FastAPI backend: the same routes and response
// shapes, answered from a sample workspace held in memory. Edits made while
// clicking around are kept until the page is reloaded, then the demo starts
// fresh. Nothing here ever leaves the browser.

import { DEPARTMENT_TO_STAGE, OPTIONS, STAGE_TO_DEPARTMENT, CORE_TYPES } from "./constants";
import { DEMO_ROLES, exitDemo, getDemoRole } from "./demoMode";
import { buildSeed, DEMO_LOGIN, dayOffset, todayIso } from "./seed";
import { handlePlanning } from "./planning";
import { handleMeetings } from "./meetings";

export class HttpError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

let store = null;
const db = () => {
  if (!store) store = buildSeed();
  return store;
};

const nowIso = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));
const DONE = ["Closed", "Scrap"];
const STAGES = ["Content", "Design", "Animate"];
const BILLED = ["Raised Invoice", "Completed"];

let idCounter = 1000;
const newId = (prefix) => {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
};

// ---------------------------------------------------------------- who is asking
const publicUser = (u) => {
  const { password_hash: _drop, ...rest } = u;
  return rest;
};

const actingUser = () => {
  const id = DEMO_LOGIN[getDemoRole()];
  return db().users.find((u) => u.id === id);
};

const stageOfUser = (user) => DEPARTMENT_TO_STAGE[user?.department] || null;

const requireAdmin = () => {
  if (actingUser().role !== "admin") throw new HttpError(403, "Only an admin can do this");
};

// ---------------------------------------------------------------- hydration
const hydrateProject = (project, { withDeliverables = true } = {}) => {
  const { clients, deliverables } = db();
  const client = clients.find((c) => c.id === project.client_id);
  const mine = deliverables.filter((d) => d.project_id === project.id);
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0]));
  mine.forEach((d) => {
    stageCounts[d.current_stage] = (stageCounts[d.current_stage] || 0) + 1;
  });
  const poc = (client?.contact_persons || []).find((c) => c.id === project.poc_id);
  return {
    ...project,
    deliverables: withDeliverables ? clone(mine) : [],
    deliverables_count: mine.length,
    stage_counts: stageCounts,
    collaborator_ids: [],
    client_name: client?.name || "",
    client_poc: poc?.name || client?.contact_person || "",
  };
};

const searchWords = (text) => (String(text || "").match(/\w+/g) || []).slice(0, 8).map((w) => w.toLowerCase());
const matchesSearch = (haystack, query) => {
  const words = searchWords(query);
  if (!words.length) return true;
  const text = haystack.join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
};

const asList = (value) => (value === undefined || value === null || value === "" ? null : Array.isArray(value) ? value : [value]);

// ---------------------------------------------------------------- work items
const listWorkItems = (q = {}) => {
  const creators = asList(q.creator_id);
  const reviewers = asList(q.reviewer_id);
  const statuses = asList(q.status);
  const stages = asList(q.stage);
  const types = asList(q.deliverable_type);
  const cats = asList(q.work_category);
  const projects = asList(q.project_id);
  const deliverables = asList(q.deliverable_id);
  let rows = db().workItems.filter((w) => {
    if (creators && !creators.includes(w.creator_id)) return false;
    if (reviewers && !reviewers.includes(w.reviewer_id)) return false;
    if (statuses && !statuses.includes(w.status)) return false;
    if (stages && !stages.includes(w.stage)) return false;
    if (types && !types.includes(w.deliverable_type)) return false;
    if (cats && !cats.includes(w.work_category)) return false;
    if (projects && !projects.includes(w.project_id)) return false;
    if (deliverables && !deliverables.includes(w.deliverable_id) && !(w.deliverable_ids || []).some((x) => deliverables.includes(x))) return false;
    if (q.date_from && w.work_date < q.date_from) return false;
    if (q.date_to && w.work_date > q.date_to) return false;
    if (q.month && w.month !== q.month) return false;
    if (q.search && !matchesSearch([w.deliverable_name, w.remarks], q.search)) return false;
    return true;
  });
  rows = rows.sort((a, b) => (b.work_date + b.created_at).localeCompare(a.work_date + a.created_at));
  const limit = Number(q.limit) || 5000;
  return clone(rows.slice(0, limit));
};

const newWorkItemFrom = (payload = {}) => {
  const user = actingUser();
  const date = payload.work_date || todayIso();
  const projectId = payload.project_id || null;
  const project = db().projects.find((p) => p.id === projectId);
  const stage = payload.stage || stageOfUser(user);
  const item = {
    id: newId("wi"),
    work_date: date,
    month: date.slice(0, 7),
    deliverable_name: "",
    deliverable_type: "",
    deliverable_link: "",
    work_category: "Core",
    version: "",
    time_taken_minutes: 0,
    time_source: "manual",
    time_benchmark_minutes: null,
    quantity: 1,
    quantity_items: [],
    deliverable_ids: [],
    video_duration_seconds: null,
    video_duration_minutes: null,
    creator_id: user.id,
    reviewer_id: null,
    manager_id: null,
    client_id: project?.client_id || null,
    project_id: projectId,
    deliverable_id: null,
    deliverable_not_available: false,
    stage,
    remarks: "",
    status: "Not Started",
    collab_group_id: null,
    collab_source_id: null,
    collab_added_by: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  Object.entries(payload).forEach(([k, v]) => {
    if (v !== undefined && v !== null && k !== "month") item[k] = v;
  });
  if (payload.creator_id === null || payload.creator_id === "") item.creator_id = user.id;
  if (item.video_duration_seconds !== null && item.video_duration_seconds !== undefined) {
    item.video_duration_minutes = Math.round((item.video_duration_seconds / 60) * 100) / 100;
  }
  item.month = String(item.work_date).slice(0, 7);
  return item;
};

const patchWorkItem = (item, patch = {}) => {
  Object.entries(patch).forEach(([k, v]) => {
    if (v === undefined || k === "id") return;
    item[k] = v;
  });
  if (patch.work_date) item.month = String(patch.work_date).slice(0, 7);
  if (patch.project_id) {
    const project = db().projects.find((p) => p.id === patch.project_id);
    if (project && !patch.client_id) item.client_id = project.client_id;
  }
  if (patch.video_duration_seconds !== undefined && patch.video_duration_seconds !== null) {
    item.video_duration_minutes = Math.round((patch.video_duration_seconds / 60) * 100) / 100;
  }
  item.updated_at = nowIso();
  return item;
};

const findWorkItem = (id) => {
  const item = db().workItems.find((w) => w.id === id);
  if (!item) throw new HttpError(404, "Work item not found");
  return item;
};

// ---------------------------------------------------------------- deliverable stage flow
const nextStageOf = (deliverable) => {
  const stages = deliverable.required_stages || [deliverable.current_stage];
  const at = stages.indexOf(deliverable.current_stage);
  return at >= 0 && at < stages.length - 1 ? stages[at + 1] : null;
};

const advanceDeliverable = (deliverable) => {
  const next = nextStageOf(deliverable);
  if (next) {
    deliverable.current_stage = next;
    deliverable.stage_status = "Not Started";
  } else {
    deliverable.stage_status = "Completed";
  }
  deliverable.updated_at = nowIso();
};

// ---------------------------------------------------------------- approvals
const hydrateApproval = (item) => {
  const d = db().deliverables.find((x) => x.id === item.deliverable_id) || {};
  const p = db().projects.find((x) => x.id === d.project_id) || {};
  const c = db().clients.find((x) => x.id === p.client_id) || {};
  const assigned = db().users.find((u) => u.id === item.assigned_to) || {};
  const window = (d.stage_schedule || {})[d.current_stage] || {};
  return {
    ...item,
    deliverable_name: d.name || "",
    deliverable_type: d.type || "",
    current_stage: d.current_stage || "Content",
    stage_status: d.stage_status || "Not Started",
    required_stages: d.required_stages || [],
    due_date: window.end_dt || d.end_dt || null,
    assigned_to_name: assigned.name || "Unassigned",
    project_name: p.name || "",
    project_code: p.code || "",
    client_name: c.name || "",
  };
};

// Ready-for-review deliverables that have no approval workflow yet get a
// manager card of their own, exactly like the real board does.
const implicitManagerItems = () =>
  db()
    .deliverables.filter((d) => d.stage_status === "Ready for Review")
    .filter((d) => !db().approvalWorkflows.some((w) => w.deliverable_id === d.id))
    .map((d) => ({
      id: `implicit-manager-${d.id}`,
      approval_workflow_id: null,
      deliverable_id: d.id,
      approval_type: "MANAGER",
      status: "PENDING",
      assigned_to: null,
      department: STAGE_TO_DEPARTMENT[d.current_stage],
      requested_at: d.updated_at,
      approved_at: null,
      hidden: false,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }));

const approvalBoard = (visibility = "visible") => {
  const user = actingUser();
  const all = [...db().approvalItems.filter((i) => i.status === "PENDING"), ...(visibility === "hidden" ? [] : implicitManagerItems())];
  const board = Object.fromEntries(OPTIONS.approval_types.map((t) => [t, []]));
  all
    .filter((i) => (visibility === "hidden" ? i.hidden : visibility === "all" ? true : !i.hidden))
    .map(hydrateApproval)
    .filter((i) => {
      if (user.role !== "manager") return true;
      if (i.approval_type === "MANAGER") return STAGE_TO_DEPARTMENT[i.current_stage] === user.department;
      return !i.assigned_to || i.assigned_to === user.id;
    })
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .forEach((i) => board[i.approval_type].push(i));
  return board;
};

const approvalCount = () => Object.values(approvalBoard()).reduce((n, list) => n + list.length, 0);

const approveItem = (id, note = "") => {
  const user = actingUser();
  if (id.startsWith("implicit-manager-")) {
    const d = db().deliverables.find((x) => x.id === id.replace("implicit-manager-", ""));
    if (d) advanceDeliverable(d);
    return { ok: true };
  }
  const item = db().approvalItems.find((i) => i.id === id);
  if (!item) throw new HttpError(404, "Approval item not found");
  item.status = "APPROVED";
  item.approved_at = nowIso();
  item.approved_by = user.id;
  item.comments = note;
  item.updated_at = nowIso();
  const siblings = db().approvalItems.filter((i) => i.approval_workflow_id === item.approval_workflow_id);
  const waiting = siblings.find((i) => i.status === "NOT_STARTED");
  if (waiting) {
    waiting.status = "PENDING";
    waiting.requested_at = nowIso();
    waiting.updated_at = nowIso();
  }
  if (siblings.every((i) => i.status === "APPROVED")) {
    const d = db().deliverables.find((x) => x.id === item.deliverable_id);
    if (d) advanceDeliverable(d);
  }
  return { ...item };
};

// ---------------------------------------------------------------- dashboard (port of home_dashboard.py)
const dayOf = (v) => (v && /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null);
const monthBounds = (month) => {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const pad = (n) => String(n).padStart(2, "0");
  const last = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${y}-${pad(m)}-${pad(last)}`];
};
const prevMonths = (month, count) => {
  let y = Number(month.slice(0, 4));
  let m = Number(month.slice(5, 7));
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out.reverse();
};
const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const diffDays = (a, b) => Math.round((new Date(`${a}T12:00:00`) - new Date(`${b}T12:00:00`)) / 86400000);
const pct = (list) => (list.length ? Math.round((100 * list.filter(Boolean).length) / list.length) : null);

const monthlyOverview = (facts, month, today, count = 12, riskDays = 2, staleDays = 90) => {
  const risk = addDays(today, riskDays);
  return prevMonths(month, count).map((m) => {
    const [start, end] = monthBounds(m);
    const staleBefore = addDays(start, -staleDays);
    let total = 0;
    let spilled = 0;
    let active = 0;
    let delayed = 0;
    let atRisk = 0;
    facts.forEach((f) => {
      const isNew = !!f.start && start <= f.start && f.start <= end;
      const inMonth = !!f.due && start <= f.due && f.due <= end;
      const startedBefore = (f.start || f.due || "") < start && !isNew;
      const stale = !f.finished && !!f.due && f.due < staleBefore && !isNew && !inMonth;
      const spilledIn = startedBefore && !stale && !!(f.start || f.due) && !f.finished;
      if (!(isNew || spilledIn)) return;
      total += 1;
      if (spilledIn && !isNew) spilled += 1;
      if (f.finished || f.ready) return;
      active += 1;
      if (f.due && f.due < today) delayed += 1;
      else if (f.due && f.due <= risk && !f.in_review) atRisk += 1;
    });
    return { month: m, total, spilled, active, delayed, at_risk: atRisk, on_track: active - delayed - atRisk };
  });
};

const dashboardHome = (monthIn) => {
  const { projects, clients, deliverables, workItems, approvalItems, users } = db();
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  let month = monthIn || thisMonth;
  if (month > thisMonth) month = thisMonth;
  const [mStart, mEnd] = monthBounds(month);
  const trendMonths = prevMonths(month, 6);
  const riskUntil = addDays(today, 2);
  const nextUntil = addDays(today, 7);
  const staleBefore = addDays(mStart, -90);

  const clientName = Object.fromEntries(clients.map((c) => [c.id, c.name]));
  const projectById = {};
  projects.forEach((p) => {
    if (p.hidden || p.status === "Scrapped") return;
    projectById[p.id] = {
      id: p.id,
      name: p.name,
      client_id: p.client_id,
      client_name: clientName[p.client_id] || "",
      status: p.status,
      end_date: dayOf(p.end_date),
    };
  });

  const owner = {};
  const latestAny = {};
  [...workItems]
    .filter((w) => w.deliverable_id && w.creator_id)
    .sort((a, b) => (b.work_date + b.created_at).localeCompare(a.work_date + a.created_at))
    .forEach((w) => {
      const key = `${w.deliverable_id}|${w.stage}`;
      if (!(key in owner)) owner[key] = w.creator_id;
      if (!(w.deliverable_id in latestAny)) latestAny[w.deliverable_id] = w.creator_id;
    });

  const revisions = {};
  workItems.forEach((w) => {
    if (w.status === "Changes Requested" || w.status === "Rework") {
      if (w.deliverable_id) revisions[w.deliverable_id] = (revisions[w.deliverable_id] || 0) + 1;
    }
  });
  const revisionSeed = { "del-5": 2, "del-12": 1, "del-10": 3, "del-1": 1, "del-6": 1 };
  Object.entries(revisionSeed).forEach(([id, n]) => {
    revisions[id] = (revisions[id] || 0) + n;
  });

  const pendingByDeliverable = {};
  approvalItems
    .filter((i) => i.status === "PENDING" && !i.hidden)
    .forEach((i) => {
      (pendingByDeliverable[i.deliverable_id] = pendingByDeliverable[i.deliverable_id] || []).push(i);
    });

  const rows = [];
  const facts = [];
  const trendDue = Object.fromEntries(trendMonths.map((m) => [m, []]));
  const trendFirst = Object.fromEntries(trendMonths.map((m) => [m, []]));
  const unscheduled = [];
  const summary = { due: 0, spilled_in: 0, delayed: 0, spilling_out: 0 };
  let staleBacklog = 0;

  deliverables.forEach((d) => {
    const project = projectById[d.project_id];
    if (!project) return;
    const stage = d.current_stage || "Content";
    const stageStatus = d.stage_status || "Not Started";
    const done = stageStatus === "Completed" || stageStatus === "Closed";
    const finished = done || BILLED.includes(project.status);
    const window = (d.stage_schedule || {})[stage] || {};
    let due = dayOf(window.end_dt) || dayOf(d.end_dt);
    if (!due && !finished) due = project.end_date;
    const finalDue = dayOf(d.end_dt) || due;
    const revs = revisions[d.id] || 0;
    const completedOn = done ? dayOf(d.updated_at) : null;
    facts.push({
      start: dayOf(d.start_dt),
      due,
      finished,
      ready: project.status === "Ready for Invoice",
      in_review: stageStatus === "Ready for Review",
    });
    if (due && trendDue[due.slice(0, 7)]) {
      trendDue[due.slice(0, 7)].push(!!((done && completedOn && completedOn > due) || (!finished && due < today)));
    }
    if (completedOn && trendFirst[completedOn.slice(0, 7)]) trendFirst[completedOn.slice(0, 7)].push(revs === 0);

    const start = dayOf(d.start_dt);
    const isNew = !!start && mStart <= start && start <= mEnd;
    const inMonth = !!due && mStart <= due && due <= mEnd;
    const startedBefore = (start || due || "") < mStart && !isNew;
    const stale = !finished && !!due && due < staleBefore && !isNew && !inMonth;
    const spilledIn = startedBefore && !stale && !!(start || due) && !finished;
    const scoped = isNew || spilledIn;
    const spillingOut = isNew && !finished && (month === thisMonth ? !!due && due > mEnd : true);
    const delayedSide = !finished && !!due && due < today && due <= mEnd && !stale;
    if (inMonth) summary.due += 1;
    if (spilledIn) summary.spilled_in += 1;
    if (delayedSide) summary.delayed += 1;
    if (spillingOut) summary.spilling_out += 1;
    if (stale) staleBacklog += 1;

    const inNext =
      !done &&
      !BILLED.includes(project.status) &&
      project.status !== "Ready for Invoice" &&
      !!finalDue &&
      today <= finalDue &&
      finalDue <= nextUntil;
    if (!due && !finished && project.status !== "Ready for Invoice" && unscheduled.length < 200) {
      unscheduled.push({ id: d.id, name: d.name, project_id: project.id, project: project.name });
    }
    if (!scoped && !inNext) return;

    let bucket = null;
    if (scoped) {
      if (BILLED.includes(project.status) || done) bucket = "billed";
      else if (project.status === "Ready for Invoice") bucket = "ready";
      else if (!due) bucket = "on";
      else if (due < today) bucket = "delay";
      else if (due <= riskUntil && stageStatus !== "Ready for Review") bucket = "risk";
      else bucket = "on";
    }
    let nextStatus = null;
    if (inNext) {
      if (due && due < today) nextStatus = "Delayed";
      else if (stageStatus === "Ready for Review") nextStatus = "In review";
      else if (due && due <= riskUntil) nextStatus = "At risk";
      else nextStatus = "On track";
    }
    const pending = pendingByDeliverable[d.id] || [];
    rows.push({
      id: d.id,
      name: d.name,
      project_id: project.id,
      stage,
      stage_status: stageStatus,
      due,
      final_due: finalDue,
      days_late: due && !done && due < today ? diffDays(today, due) : null,
      bucket,
      month_flags: scoped ? { new: isNew, due: inMonth, spilled_in: spilledIn, spilling_out: spillingOut } : null,
      next_status: nextStatus,
      owner_id: owner[`${d.id}|${stage}`] || latestAny[d.id] || null,
      revisions: revs,
      pending_approvals: pending.length,
      approvals: pending.map((p) => ({ type: p.approval_type, assigned_to: p.assigned_to })),
    });
  });

  const doneDeliverables = new Set(deliverables.filter((d) => d.stage_status === "Completed").map((d) => d.id));
  const reviews = workItems
    .filter((w) => w.status === "Ready for Review" && !doneDeliverables.has(w.deliverable_id))
    .filter((w) => !BILLED.includes((projectById[w.project_id] || {}).status))
    .filter((w) => !w.project_id || projectById[w.project_id])
    .map((w) => ({
      id: w.id,
      name: w.deliverable_name || "Untitled work item",
      project_id: w.project_id,
      deliverable_id: w.deliverable_id,
      stage: w.stage,
      owner_id: w.creator_id,
      reviewer_id: w.reviewer_id,
      since: w.updated_at || w.created_at,
    }));

  const windowStart = monthBounds(trendMonths[0])[0];
  const discipline = Object.fromEntries(trendMonths.map((m) => [m, []]));
  workItems.forEach((w) => {
    if (w.work_date < windowStart || w.work_date > mEnd) return;
    const m = w.work_date.slice(0, 7);
    if (!discipline[m]) return;
    const missingDeliverable = w.work_category === "Core" && !w.deliverable_id && !w.deliverable_not_available;
    const missingTime = ["Closed", "Ready for Review"].includes(w.status) && Number(w.time_taken_minutes || 0) <= 0;
    discipline[m].push(!(missingDeliverable || missingTime));
  });
  const trend = trendMonths.map((m) => ({
    month: m,
    delay_rate: pct(trendDue[m]),
    first_pass: pct(trendFirst[m]),
    discipline: pct(discipline[m]),
  }));

  const members = users.filter((u) => ["member", "manager"].includes(u.role) && u.active !== false);
  const lastLog = {};
  workItems.forEach((w) => {
    if (w.creator_id && (!lastLog[w.creator_id] || w.work_date > lastLog[w.creator_id])) lastLog[w.creator_id] = w.work_date;
  });
  let staleCutoff = today;
  for (let n = 3; n > 0; ) {
    staleCutoff = addDays(staleCutoff, -1);
    const wd = new Date(`${staleCutoff}T12:00:00`).getDay();
    if (wd !== 0 && wd !== 6) n -= 1;
  }
  const staleMembers = members
    .filter((u) => !lastLog[u.id] || lastLog[u.id] < staleCutoff)
    .map((u) => ({ id: u.id, name: u.name, department: u.department, last_logged: lastLog[u.id] || null }));

  const usedProjects = new Set(rows.map((r) => r.project_id));
  return {
    month,
    today,
    definitions: { at_risk_days: 2, critical_late_days: 3, stale_working_days: 3, next_days: 7 },
    deliverables: rows,
    unscheduled,
    stale_backlog: staleBacklog,
    month_summary: summary,
    reviews,
    projects: Object.fromEntries([...usedProjects].map((id) => [id, projectById[id]])),
    trend,
    monthly: monthlyOverview(facts, thisMonth, today),
    members: {
      tracked: members.map((u) => ({ id: u.id, name: u.name, department: u.department })),
      stale: staleMembers,
    },
  };
};

const teamActivity = () => {
  const { users, workItems, projects } = db();
  const today = todayIso();
  const members = users.filter((u) => ["member", "manager"].includes(u.role) && u.active !== false);
  const dow = new Date(`${today}T12:00:00`).getDay();
  const weekday = (dow + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -weekday);
  const projectName = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const minutes = (w) => Math.max(Number(w.time_taken_minutes) || 0, 0);
  const touched = (w) => w.updated_at || w.created_at || "";
  return {
    working_day: weekday < 5,
    week_expected_minutes: (Math.min(weekday, 4) + 1) * 510,
    members: members.map((u) => {
      const mine = workItems.filter((w) => w.creator_id === u.id && w.work_date >= addDays(today, -14));
      const todays = mine.filter((w) => w.work_date === today).sort((a, b) => touched(b).localeCompare(touched(a)));
      const latest = todays[0];
      const recent = [...mine]
        .sort((a, b) => (b.work_date + touched(b)).localeCompare(a.work_date + touched(a)))
        .slice(0, 4);
      return {
        user_id: u.id,
        today_minutes: Math.round(todays.reduce((n, w) => n + minutes(w), 0)),
        week_minutes: Math.round(mine.filter((w) => w.work_date >= weekStart).reduce((n, w) => n + minutes(w), 0)),
        now: latest
          ? {
              name: latest.deliverable_name || "Untitled work item",
              project: projectName[latest.project_id] || "",
              stage: latest.stage,
              status: latest.status,
              minutes: Math.round(minutes(latest)),
            }
          : null,
        recent: recent.map((w) => ({
          name: w.deliverable_name || "Untitled work item",
          project: projectName[w.project_id] || "",
          status: w.status,
          minutes: Math.round(minutes(w)),
          date: w.work_date,
        })),
      };
    }),
  };
};

// ---------------------------------------------------------------- efficiency (port of efficiency.py)
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

const capacityBreakdown = (cap, nonCoreMinutes) => {
  const wd = Number(cap?.working_days) || 0;
  const leave = Number(cap?.leave_days) || 0;
  const hpd = Number(cap?.working_hours_per_day) || 8.5;
  const after = Math.max(0, round2(wd - leave));
  const monthly = round2(after * hpd);
  const nonCoreHours = round2(nonCoreMinutes / 60);
  const coreHours = round2(Math.max(0, monthly - nonCoreHours));
  return {
    working_days: round2(wd),
    leave_days: round2(leave),
    working_days_after_leave: after,
    working_hours_per_day: round2(hpd),
    monthly_working_hours: monthly,
    non_core_hours: nonCoreHours,
    core_hours: coreHours,
    core_days: hpd ? round2(coreHours / hpd) : 0,
    include_in_team_average: cap ? cap.include_in_team_average !== false : true,
  };
};

const categoryOf = (w) => OPTIONS.deliverable_type_categories[w.deliverable_type] || w.work_category || "Core";

const employeeRow = (user, month) => {
  const { capacities, targets, workItems } = db();
  const cap = capacities.find((c) => c.user_id === user.id && c.month === month);
  const mine = workItems.filter((w) => w.creator_id === user.id && w.month === month);
  const userTargets = targets.filter((t) => t.user_id === user.id).sort((a, b) => a.activity_name.localeCompare(b.activity_name));
  let nonCore = 0;
  const nonCoreByType = {};
  const closedByType = {};
  let closedTotal = 0;
  mine.forEach((w) => {
    if (categoryOf(w) === "Non-Core") {
      const m = Number(w.time_taken_minutes) || 0;
      nonCore += m;
      nonCoreByType[w.deliverable_type || "Other"] = (nonCoreByType[w.deliverable_type || "Other"] || 0) + m;
    } else if (DONE.includes(w.status)) {
      const q = Number(w.quantity) || 1;
      closedByType[w.deliverable_type || "Other"] = (closedByType[w.deliverable_type || "Other"] || 0) + q;
      closedTotal += q;
    }
  });
  const breakdown = capacityBreakdown(cap, nonCore);
  const activities = userTargets.map((t) => {
    const per = Number(t.time_per_unit_minutes) || 0;
    const potential = per ? round2((breakdown.core_hours * 60) / per) : 0;
    const actual = closedByType[t.activity_name] || 0;
    return {
      target_id: t.id,
      activity_name: t.activity_name,
      daily_potential: breakdown.core_days ? round2(potential / breakdown.core_days) : 0,
      time_per_unit_minutes: per,
      monthly_potential: potential,
      actual_closed: actual,
      productivity: potential ? round2((actual / potential) * 100) : 0,
    };
  });
  const rated = activities.filter((a) => a.monthly_potential > 0);
  const totalPotential = rated.reduce((n, a) => n + a.monthly_potential, 0);
  const productivity = cap && rated.length ? round2((rated.reduce((n, a) => n + a.actual_closed, 0) / totalPotential) * 100) : 0;
  const names = new Set(userTargets.map((t) => t.activity_name));
  return {
    user_id: user.id,
    name: user.name,
    department: user.department || "",
    role: user.role,
    has_capacity: !!cap,
    has_targets: activities.length > 0,
    productivity,
    closed_deliverables: closedTotal,
    untracked_closed_deliverables: Object.entries(closedByType).filter(([k]) => !names.has(k)).reduce((n, [, v]) => n + v, 0),
    non_core_by_type: Object.entries(nonCoreByType)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ deliverable_type: k, hours: round2(v / 60) })),
    activities,
    ...breakdown,
  };
};

const efficiencyRows = (month) => {
  const me = actingUser();
  let people = db().users.filter((u) => !["admin", "hr"].includes(u.role) && u.active !== false);
  if (me.role === "manager") people = people.filter((u) => u.department === me.department);
  if (me.role === "member") people = people.filter((u) => u.id === me.id);
  return people.map((u) => employeeRow(u, month));
};

const teamProductivity = (rows) => {
  const scored = rows.filter((r) => r.has_capacity && r.include_in_team_average);
  return scored.length ? round2(scored.reduce((n, r) => n + (r.productivity || 0), 0) / scored.length) : 0;
};

const efficiencyOverview = (month) => {
  const prev = prevMonths(month, 2)[0];
  const rows = efficiencyRows(month);
  const configured = rows.filter((r) => r.has_capacity);
  const prevProd = teamProductivity(efficiencyRows(prev));
  const prod = teamProductivity(rows);
  return {
    month,
    aggregation: "weighted",
    kpis: {
      team_productivity: prod,
      team_productivity_delta: round2(prod - prevProd),
      total_core_hours: round2(configured.reduce((n, r) => n + r.core_hours, 0)),
      total_non_core_hours: round2(rows.reduce((n, r) => n + r.non_core_hours, 0)),
      average_core_days: configured.length ? round2(configured.reduce((n, r) => n + r.core_days, 0) / configured.length) : 0,
      closed_deliverables: rows.reduce((n, r) => n + r.closed_deliverables, 0),
      employees_tracked: configured.length,
      employees_total: rows.length,
    },
    employees: [...rows]
      .sort((a, b) => b.productivity - a.productivity)
      .map((r) => ({
        user_id: r.user_id,
        name: r.name,
        department: r.department,
        has_capacity: r.has_capacity,
        has_targets: r.has_targets,
        productivity: r.productivity,
        working_days: r.working_days,
        leave_days: r.leave_days,
        working_days_after_leave: r.working_days_after_leave,
        core_days: r.core_days,
        core_hours: r.core_hours,
        non_core_hours: r.non_core_hours,
        closed_deliverables: r.closed_deliverables,
      })),
    attention: {
      missing_capacity: rows.filter((r) => !r.has_capacity).map((r) => ({ user_id: r.user_id, name: r.name })),
      missing_targets: rows.filter((r) => r.has_capacity && !r.has_targets).map((r) => ({ user_id: r.user_id, name: r.name })),
      excessive_non_core: rows
        .filter((r) => r.monthly_working_hours && r.non_core_hours / r.monthly_working_hours > 0.3)
        .map((r) => ({ user_id: r.user_id, name: r.name, non_core_hours: r.non_core_hours })),
      no_closed_deliverables: rows.filter((r) => r.has_capacity && r.closed_deliverables === 0).map((r) => ({ user_id: r.user_id, name: r.name })),
    },
  };
};

const efficiencyEmployee = (userId, month) => {
  const user = db().users.find((u) => u.id === userId);
  if (!user) throw new HttpError(404, "Employee not found");
  const row = employeeRow(user, month);
  const closed = db()
    .workItems.filter((w) => w.month === month && w.creator_id === userId && DONE.includes(w.status) && categoryOf(w) === "Core")
    .sort((a, b) => a.work_date.localeCompare(b.work_date))
    .map((w) => ({
      id: w.id,
      deliverable_name: w.deliverable_name,
      deliverable_type: w.deliverable_type,
      work_category: w.work_category,
      work_date: w.work_date,
      time_taken_minutes: w.time_taken_minutes,
      project_id: w.project_id,
      quantity: w.quantity,
    }));
  return {
    month,
    aggregation: "weighted",
    ...row,
    deliverables: closed,
    formula: {
      working_days_after_leave: "Working days − Leave days",
      monthly_working_hours: "Working days after leave × Working hours/day",
      non_core_hours: "Sum of Non-Core time logged ÷ 60",
      core_hours: "Monthly working hours − Non-core hours",
      core_days: "Core hours ÷ Working hours/day",
      monthly_potential: "(Core hours × 60) ÷ minutes per unit for that activity",
      activity_productivity: "Actual closed ÷ Monthly potential × 100",
      employee_productivity: "Total actual closed ÷ Total monthly potential × 100",
    },
  };
};

const activityBreakdown = (month) => {
  const agg = {};
  efficiencyRows(month).forEach((r) => {
    r.activities.forEach((a) => {
      const b = (agg[a.activity_name] = agg[a.activity_name] || {
        activity_name: a.activity_name,
        monthly_potential: 0,
        actual_closed: 0,
        employees: [],
      });
      b.monthly_potential = round2(b.monthly_potential + a.monthly_potential);
      b.actual_closed += a.actual_closed;
      if (a.actual_closed || a.monthly_potential) {
        b.employees.push({
          user_id: r.user_id,
          name: r.name,
          daily_potential: a.daily_potential,
          actual_closed: a.actual_closed,
          monthly_potential: a.monthly_potential,
          productivity: a.productivity,
        });
      }
    });
  });
  const activities = Object.values(agg)
    .map((b) => ({
      ...b,
      productivity: b.monthly_potential ? round2((b.actual_closed / b.monthly_potential) * 100) : 0,
      employee_count: b.employees.length,
    }))
    .sort((a, b) => b.actual_closed - a.actual_closed);
  return {
    month,
    kpis: {
      total_potential: round2(activities.reduce((n, a) => n + a.monthly_potential, 0)),
      total_actual: activities.reduce((n, a) => n + a.actual_closed, 0),
      activities_tracked: activities.length,
    },
    activities,
  };
};

const efficiencyTrend = (month, months = 6) =>
  prevMonths(month || todayIso().slice(0, 7), Math.max(1, Math.min(Number(months) || 6, 12))).map((m) => {
    const rows = efficiencyRows(m);
    return {
      month: m,
      team_productivity: teamProductivity(rows),
      core_hours: round2(rows.filter((r) => r.has_capacity).reduce((n, r) => n + r.core_hours, 0)),
      non_core_hours: round2(rows.reduce((n, r) => n + r.non_core_hours, 0)),
      closed_deliverables: rows.reduce((n, r) => n + r.closed_deliverables, 0),
    };
  });

// ---------------------------------------------------------------- invoicing
const CATEGORY_OF_STAGE = { Content: "Content", Design: "Design", Animate: "Animation" };
const invoiceMeta = (p) => {
  const client = db().clients.find((c) => c.id === p.client_id) || {};
  const poc = (client.contact_persons || []).find((c) => c.id === p.poc_id);
  const changed = p.status_changed_at || p.updated_at;
  return {
    id: p.id,
    name: p.name,
    code: p.code,
    client: client.name || "",
    poc: poc?.name || "",
    status: p.status,
    status_changed_at: changed,
    waiting_days: Math.max(0, diffDays(todayIso(), String(changed).slice(0, 10))),
    invoice_raised_at: p.invoice_raised_at || null,
  };
};
const invoiceLines = (projectId) =>
  db()
    .workItems.filter((w) => w.project_id === projectId && w.status !== "Scrap")
    .map((w) => ({
      id: w.id,
      category: CATEGORY_OF_STAGE[w.stage] || "Content",
      name: w.deliverable_name,
      type: w.deliverable_type,
      qty: w.quantity || 1,
      duration_seconds: w.video_duration_seconds,
      minutes: Number(w.time_taken_minutes) || 0,
      made_by: db().users.find((u) => u.id === w.creator_id)?.name || "Unassigned",
      made_by_role: CATEGORY_OF_STAGE[w.stage] || "Content",
      link: w.deliverable_link || "",
    }));
const invoiceSummary = (lines) => {
  const out = Object.fromEntries(["Content", "Design", "Animation"].map((c) => [c, { qty: 0, minutes: 0 }]));
  lines.forEach((l) => {
    out[l.category].qty += l.qty;
    out[l.category].minutes += l.minutes;
  });
  Object.values(out).forEach((v) => {
    v.qty = Math.round(v.qty);
    v.minutes = Math.round(v.minutes);
  });
  return out;
};

// ---------------------------------------------------------------- routes
const route = (method, pattern, handler) => ({
  method,
  keys: [...pattern.matchAll(/:([a-z_]+)/g)].map((m) => m[1]),
  regex: new RegExp(`^${pattern.replace(/:([a-z_]+)/g, "([^/]+)")}/?$`),
  handler,
});

const ROUTES = [
  // ---- auth
  route("POST", "/auth/login", ({ body }) => {
    const login = String(body.login || "").trim().toLowerCase();
    const user = db().users.find((u) => u.username === login || u.email === login) || actingUser();
    return { ...publicUser(user), access_token: "demo-token" };
  }),
  route("POST", "/auth/logout", () => {
    exitDemo();
    window.setTimeout(() => window.location.replace("/"), 50);
    return { message: "Logged out" };
  }),
  route("GET", "/auth/me", () => publicUser(actingUser())),
  route("PATCH", "/auth/profile", ({ body }) => {
    const user = actingUser();
    if (body.username) user.username = String(body.username).trim().toLowerCase();
    return publicUser(user);
  }),
  route("POST", "/auth/forgot-password", () => ({ message: "This is a demo - no email is sent." })),
  route("POST", "/auth/reset-password", () => ({ message: "This is a demo - passwords are not used." })),
  route("GET", "/config/options", () => OPTIONS),

  // ---- people and clients
  route("GET", "/users", () => db().users.map(publicUser)),
  route("POST", "/users", ({ body }) => {
    requireAdmin();
    const user = { id: newId("u"), active: true, removed: false, department: "", ...body };
    delete user.password;
    db().users.push(user);
    return publicUser(user);
  }),
  route("PATCH", "/users/:id", ({ params, body }) => {
    requireAdmin();
    const user = db().users.find((u) => u.id === params.id);
    if (!user) throw new HttpError(404, "User not found");
    const { password: _ignore, ...rest } = body;
    Object.entries(rest).forEach(([k, v]) => {
      if (v !== null && v !== undefined) user[k] = v;
    });
    return publicUser(user);
  }),
  route("DELETE", "/users/:id", ({ params }) => {
    requireAdmin();
    const user = db().users.find((u) => u.id === params.id);
    if (!user) throw new HttpError(404, "User not found");
    user.removed = true;
    user.active = false;
    return { message: "User removed" };
  }),
  route("GET", "/clients", () => clone(db().clients)),
  route("POST", "/clients", ({ body }) => {
    requireAdmin();
    const client = { id: newId("c"), contact_person: "", contact_persons: [], status: "Active", ...body };
    db().clients.push(client);
    return clone(client);
  }),
  route("PATCH", "/clients/:id", ({ params, body }) => {
    requireAdmin();
    const client = db().clients.find((c) => c.id === params.id);
    if (!client) throw new HttpError(404, "Client not found");
    Object.entries(body).forEach(([k, v]) => {
      if (v !== null && v !== undefined) client[k] = v;
    });
    return clone(client);
  }),
  route("DELETE", "/clients/:id", ({ params }) => {
    requireAdmin();
    if (db().projects.some((p) => p.client_id === params.id && !["Completed", "Raised Invoice", "Scrapped"].includes(p.status))) {
      throw new HttpError(400, "This client still has an unfinished project");
    }
    db().clients = db().clients.filter((c) => c.id !== params.id);
    return { message: "Client deleted" };
  }),
  route("POST", "/clients/:id/contacts", ({ params, body }) => {
    const client = db().clients.find((c) => c.id === params.id);
    if (!client) throw new HttpError(404, "Client not found");
    const contact = { id: newId("cp"), name: "", email: "", phone: "", designation: "", ...body };
    client.contact_persons.push(contact);
    return clone(client);
  }),
  route("PATCH", "/clients/:id/contacts/:contact_id", ({ params, body }) => {
    const client = db().clients.find((c) => c.id === params.id);
    const contact = client?.contact_persons.find((c) => c.id === params.contact_id);
    if (!contact) throw new HttpError(404, "Contact not found");
    Object.entries(body).forEach(([k, v]) => {
      if (v !== null && v !== undefined) contact[k] = v;
    });
    return clone(client);
  }),
  route("DELETE", "/clients/:id/contacts/:contact_id", ({ params }) => {
    const client = db().clients.find((c) => c.id === params.id);
    if (!client) throw new HttpError(404, "Client not found");
    client.contact_persons = client.contact_persons.filter((c) => c.id !== params.contact_id);
    return clone(client);
  }),

  // ---- work sheet lookups
  route("GET", "/worksheet/lookups", () => ({
    clients: [...db().clients].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name })),
    projects: db()
      .projects.filter((p) => !p.hidden)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => ({ id: p.id, name: p.name, client_id: p.client_id, code: p.code, status: p.status, description: p.description })),
    deliverables: db().deliverables.map((d) => ({
      id: d.id,
      name: d.name,
      project_id: d.project_id,
      type: d.type,
      current_stage: d.current_stage,
      stage_status: d.stage_status,
    })),
  })),
  route("GET", "/worksheet/deliverable-names", () => {
    const out = {};
    db().deliverables.forEach((d) => {
      (out[d.project_id] = out[d.project_id] || []).push(d.name.toLowerCase());
    });
    return out;
  }),

  // ---- work items
  route("GET", "/work-items/pending-count", () => {
    const user = actingUser();
    const stage = user.role === "admin" ? null : stageOfUser(user);
    return { count: db().workItems.filter((w) => !DONE.includes(w.status) && (!stage || w.stage === stage)).length };
  }),
  route("GET", "/work-items/history", ({ query }) =>
    db()
      .workItems.filter((w) => !query.stage || w.stage === query.stage)
      .slice(0, 0)
  ),
  route("GET", "/work-items", ({ query }) => listWorkItems(query)),
  route("POST", "/work-items/bulk-create", ({ body }) => {
    const rows = [];
    for (let i = 0; i < Math.min(Number(body.count) || 1, 200); i += 1) {
      const item = newWorkItemFrom(body.template || {});
      db().workItems.push(item);
      rows.push(item);
    }
    return clone(rows);
  }),
  route("POST", "/work-items/bulk-update", ({ body }) => {
    const rows = (body.ids || []).map((id) => patchWorkItem(findWorkItem(id), body.patch || {}));
    return clone(rows);
  }),
  route("POST", "/work-items/bulk-delete", ({ body }) => {
    const ids = new Set(body.ids || []);
    const before = db().workItems.length;
    db().workItems = db().workItems.filter((w) => !ids.has(w.id));
    return { deleted_count: before - db().workItems.length };
  }),
  route("POST", "/work-items/collaborators", ({ body }) => {
    const created = [];
    (body.ids || []).forEach((id) => {
      const source = findWorkItem(id);
      (body.creator_ids || []).forEach((creatorId) => {
        if (db().workItems.some((w) => w.collab_source_id === source.id && w.creator_id === creatorId)) return;
        const copy = {
          ...clone(source),
          id: newId("wi"),
          creator_id: creatorId,
          collab_source_id: source.id,
          collab_group_id: source.collab_group_id || `grp-${source.id}`,
          collab_added_by: actingUser().id,
          status: "Not Started",
          time_taken_minutes: 0,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        source.collab_group_id = copy.collab_group_id;
        db().workItems.push(copy);
        created.push(copy);
      });
    });
    return { created: clone(created), updated_sources: [], skipped: [], row_errors: [] };
  }),
  route("POST", "/work-items", ({ body }) => {
    const item = newWorkItemFrom(body);
    db().workItems.push(item);
    return clone(item);
  }),
  route("POST", "/work-items/:id/review", ({ params, query }) => {
    const item = findWorkItem(params.id);
    item.status = query.action === "approve" ? "Closed" : "Changes Requested";
    if (query.note) item.remarks = query.note;
    item.updated_at = nowIso();
    return clone(item);
  }),
  route("POST", "/work-items/:id/expand-units", ({ params }) => clone(findWorkItem(params.id))),
  route("PATCH", "/work-items/:id", ({ params, body }) => clone(patchWorkItem(findWorkItem(params.id), body))),
  route("DELETE", "/work-items/:id", ({ params }) => {
    findWorkItem(params.id);
    db().workItems = db().workItems.filter((w) => w.id !== params.id);
    return { message: "Deleted" };
  }),

  // ---- projects
  route("GET", "/projects/metrics", () => {
    const today = todayIso();
    const weekEnd = addDays(today, 7);
    const { projects, deliverables } = db();
    return {
      active_projects: projects.filter((p) => p.status === "Active").length,
      in_rework: projects.filter((p) => p.status === "In Rework").length,
      due_this_week: projects.filter((p) => p.end_date >= today && p.end_date <= weekEnd && p.status !== "Completed").length,
      total_deliverables: deliverables.length,
    };
  }),
  route("GET", "/projects/duplicate-check", () => ({ window_days: 30, duplicates: [] })),
  route("POST", "/projects/bulk-hide", ({ body }) => {
    db().projects.forEach((p) => {
      if ((body.project_ids || []).includes(p.id)) p.hidden = true;
    });
    return { updated: (body.project_ids || []).length };
  }),
  route("POST", "/projects/bulk-unhide", ({ body }) => {
    db().projects.forEach((p) => {
      if ((body.project_ids || []).includes(p.id)) p.hidden = false;
    });
    return { updated: (body.project_ids || []).length };
  }),
  route("POST", "/projects/bulk-status", ({ body }) => {
    db().projects.forEach((p) => {
      if ((body.project_ids || []).includes(p.id)) {
        p.status = body.status;
        p.status_changed_at = nowIso();
      }
    });
    return { updated: (body.project_ids || []).length };
  }),
  route("POST", "/projects/bulk-delete", ({ body }) => {
    requireAdmin();
    const ids = new Set(body.project_ids || []);
    db().projects = db().projects.filter((p) => !ids.has(p.id));
    db().deliverables = db().deliverables.filter((d) => !ids.has(d.project_id));
    return { deleted_count: ids.size };
  }),
  route("POST", "/projects/reorder", ({ body }) => {
    const p = db().projects.find((x) => x.id === body.project_id);
    if (p) {
      p.status = body.target_status;
      p.status_changed_at = nowIso();
    }
    return { message: "Reordered" };
  }),
  route("GET", "/projects", ({ query }) => {
    const user = actingUser();
    let rows = db().projects;
    const visibility = user.role === "admin" ? query.visibility || "visible" : "visible";
    if (visibility === "visible") rows = rows.filter((p) => !p.hidden);
    else if (visibility === "hidden") rows = rows.filter((p) => p.hidden);
    if (query.status) rows = rows.filter((p) => p.status === query.status);
    if (query.search) rows = rows.filter((p) => matchesSearch([p.name, p.code], query.search));
    const withDeliverables = String(query.include_deliverables) === "true";
    return [...rows]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((p) => hydrateProject(p, { withDeliverables }));
  }),
  route("POST", "/projects", ({ body }) => {
    requireAdmin();
    const count = db().projects.length + 1;
    const project = {
      id: newId("proj"),
      code: `PRJ-${2200 + count}`,
      name: body.name,
      client_id: body.client_id,
      description: body.description || "",
      poc_id: body.poc_id || null,
      start_date: body.start_date || null,
      end_date: body.end_date || null,
      status: body.status || "Active",
      kanban_order: count,
      status_changed_at: nowIso(),
      hidden: false,
      hidden_at: null,
      hidden_by: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db().projects.push(project);
    (body.deliverables || []).forEach((input) => {
      const stages = input.required_stages?.length ? input.required_stages : ["Content"];
      db().deliverables.push({
        id: newId("del"),
        project_id: project.id,
        name: input.name,
        type: input.type || "",
        start_dt: input.start_dt || null,
        end_dt: input.end_dt || null,
        stage_schedule: input.stage_schedule || {},
        required_stages: stages,
        current_stage: input.current_stage || stages[0],
        stage_status: "Not Started",
        approval_types: input.approval_types || [],
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    });
    return hydrateProject(project);
  }),
  route("GET", "/projects/:id/work-log", ({ params }) => {
    const ids = new Set(db().deliverables.filter((d) => d.project_id === params.id).map((d) => d.id));
    const rows = db()
      .workItems.filter((w) => w.project_id === params.id || ids.has(w.deliverable_id))
      .sort((a, b) => (b.work_date + b.created_at).localeCompare(a.work_date + a.created_at));
    return {
      items: rows.slice(0, 300).map((w) => ({
        id: w.id,
        work_date: w.work_date,
        stage: w.stage,
        deliverable_name: w.deliverable_name,
        creator_id: w.creator_id,
        time_taken_minutes: w.time_taken_minutes,
        status: w.status,
      })),
      total: rows.length,
      total_minutes: rows.reduce((n, w) => n + (Number(w.time_taken_minutes) || 0), 0),
    };
  }),
  route("GET", "/projects/:id/share", () => ({ shared: false })),
  route("POST", "/projects/:id/share", () => {
    throw new HttpError(403, "Sharing links is turned off in the demo");
  }),
  route("DELETE", "/projects/:id/share", () => ({ shared: false })),
  route("POST", "/projects/:id/hide", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (p) p.hidden = true;
    return hydrateProject(p);
  }),
  route("POST", "/projects/:id/unhide", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (p) p.hidden = false;
    return hydrateProject(p);
  }),
  route("POST", "/projects/:id/deliverables/import", () => {
    throw new HttpError(403, "File import is turned off in the demo");
  }),
  route("GET", "/projects/:id", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (!p) throw new HttpError(404, "Project not found");
    return hydrateProject(p);
  }),
  route("PATCH", "/projects/:id", ({ params, body }) => {
    requireAdmin();
    const p = db().projects.find((x) => x.id === params.id);
    if (!p) throw new HttpError(404, "Project not found");
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && v !== null) p[k] = v;
    });
    if (body.status) p.status_changed_at = nowIso();
    p.updated_at = nowIso();
    return hydrateProject(p);
  }),
  route("DELETE", "/projects/:id", ({ params }) => {
    requireAdmin();
    db().projects = db().projects.filter((p) => p.id !== params.id);
    db().deliverables = db().deliverables.filter((d) => d.project_id !== params.id);
    return { message: "Project deleted" };
  }),

  // ---- deliverables
  route("GET", "/deliverables", ({ query }) =>
    clone(db().deliverables.filter((d) => !query.project_id || d.project_id === query.project_id))
  ),
  route("POST", "/deliverables", ({ body }) => {
    const stages = body.required_stages?.length ? body.required_stages : ["Content"];
    const d = {
      id: newId("del"),
      project_id: body.project_id,
      name: body.name,
      type: body.type || "",
      start_dt: body.start_dt || null,
      end_dt: body.end_dt || null,
      stage_schedule: body.stage_schedule || {},
      required_stages: stages,
      current_stage: body.current_stage || stages[0],
      stage_status: "Not Started",
      approval_types: body.approval_types || [],
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    db().deliverables.push(d);
    return clone(d);
  }),
  route("GET", "/deliverables/:id/approvals", ({ params }) => {
    const workflow = db().approvalWorkflows.find((w) => w.deliverable_id === params.id) || null;
    if (!workflow) return { workflow: null, items: [] };
    return {
      workflow: clone(workflow),
      items: db().approvalItems.filter((i) => i.approval_workflow_id === workflow.id).map(hydrateApproval),
    };
  }),
  route("PUT", "/deliverables/:id/approval-workflow", ({ params, body }) => {
    const d = db().deliverables.find((x) => x.id === params.id);
    if (!d) throw new HttpError(404, "Deliverable not found");
    d.approval_types = body.approval_types || [];
    return { workflow: null, items: [] };
  }),
  route("POST", "/deliverables/:id/approve", ({ params }) => {
    const d = db().deliverables.find((x) => x.id === params.id);
    if (!d) throw new HttpError(404, "Deliverable not found");
    advanceDeliverable(d);
    return clone(d);
  }),
  route("PATCH", "/deliverables/:id", ({ params, body }) => {
    const d = db().deliverables.find((x) => x.id === params.id);
    if (!d) throw new HttpError(404, "Deliverable not found");
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && v !== null) d[k] = v;
    });
    d.updated_at = nowIso();
    return clone(d);
  }),
  route("DELETE", "/deliverables/:id", ({ params }) => {
    db().deliverables = db().deliverables.filter((d) => d.id !== params.id);
    return { message: "Deleted" };
  }),

  // ---- approvals
  route("GET", "/approvals/pending-count", () => ({ count: approvalCount() })),
  route("GET", "/approvals/board", ({ query }) => approvalBoard(query.visibility)),
  route("GET", "/approvals", () => Object.values(approvalBoard()).flat()),
  route("POST", "/approval-items/bulk-approve", ({ body }) => {
    (body.ids || []).forEach((id) => approveItem(id, body.note));
    return { approved: (body.ids || []).length };
  }),
  route("POST", "/approval-items/bulk-hide", ({ body }) => {
    db().approvalItems.forEach((i) => {
      if ((body.approval_item_ids || []).includes(i.id)) i.hidden = true;
    });
    return { updated: (body.approval_item_ids || []).length };
  }),
  route("POST", "/approval-items/bulk-unhide", ({ body }) => {
    db().approvalItems.forEach((i) => {
      if ((body.approval_item_ids || []).includes(i.id)) i.hidden = false;
    });
    return { updated: (body.approval_item_ids || []).length };
  }),
  route("POST", "/approval-items/:id/approve", ({ params, body }) => approveItem(params.id, body?.note)),
  route("PATCH", "/approval-items/:id/move", ({ params, body }) => {
    const item = db().approvalItems.find((i) => i.id === params.id);
    if (item) item.approval_type = body.approval_type;
    return item ? hydrateApproval(item) : { ok: true };
  }),
  route("POST", "/approval-items/:id/hide", ({ params }) => {
    const item = db().approvalItems.find((i) => i.id === params.id);
    if (item) item.hidden = true;
    return { ok: true };
  }),
  route("POST", "/approval-items/:id/unhide", ({ params }) => {
    const item = db().approvalItems.find((i) => i.id === params.id);
    if (item) item.hidden = false;
    return { ok: true };
  }),
  route("GET", "/bulk-review/count", () => ({
    count: db().workItems.filter((w) => w.status === "Ready for Review" && w.reviewer_id === actingUser().id).length,
  })),
  route("GET", "/bulk-review", () => {
    const me = actingUser();
    return db()
      .workItems.filter((w) => w.status === "Ready for Review" && w.reviewer_id === me.id)
      .map((w) => {
        const p = db().projects.find((x) => x.id === w.project_id) || {};
        const c = db().clients.find((x) => x.id === p.client_id) || {};
        const creator = db().users.find((u) => u.id === w.creator_id) || {};
        const d = db().deliverables.find((x) => x.id === w.deliverable_id) || {};
        const window = (d.stage_schedule || {})[w.stage] || {};
        return {
          ...clone(w),
          due_date: window.end_dt || d.end_dt || null,
          project_name: p.name || "",
          project_code: p.code || "",
          client_name: c.name || "",
          creator_name: creator.name || "Unknown",
          reviewer_name: me.name,
        };
      });
  }),

  // ---- dashboard
  route("GET", "/dashboard/home", ({ query }) => dashboardHome(query.month)),
  route("GET", "/dashboard/team-activity", () => teamActivity()),
  route("GET", "/dashboard/summary", () => ({})),
  route("GET", "/dashboard/team-summary", () => ({})),
  route("GET", "/dashboard/attention-items", () => []),
  route("GET", "/dashboard/overview", () => ({})),

  // ---- efficiency
  route("GET", "/efficiency/overview", ({ query }) => efficiencyOverview(query.month)),
  route("GET", "/efficiency/employee/:id", ({ params, query }) => efficiencyEmployee(params.id, query.month)),
  route("GET", "/efficiency/activity-breakdown", ({ query }) => activityBreakdown(query.month)),
  route("GET", "/efficiency/trend", ({ query }) => efficiencyTrend(query.month, query.months)),
  route("GET", "/efficiency/activity-catalog", () => CORE_TYPES),
  route("GET", "/efficiency/time-defaults", ({ query }) => {
    const userId = query.user_id || actingUser().id;
    const defaults = {};
    db()
      .targets.filter((t) => t.user_id === userId && t.active !== false)
      .forEach((t) => {
        defaults[t.activity_name] = t.time_per_unit_minutes;
      });
    return { user_id: userId, defaults };
  }),
  route("GET", "/efficiency/monthly-capacity/:user_id/:month", ({ params }) => {
    const cap = db().capacities.find((c) => c.user_id === params.user_id && c.month === params.month);
    if (!cap) throw new HttpError(404, "No capacity configured for this month");
    return clone(cap);
  }),
  route("GET", "/efficiency/monthly-capacity", ({ query }) =>
    clone(db().capacities.filter((c) => (!query.month || c.month === query.month) && (!query.user_id || c.user_id === query.user_id)))
  ),
  route("POST", "/efficiency/monthly-capacity", ({ body }) => {
    const existing = db().capacities.find((c) => c.user_id === body.user_id && c.month === body.month);
    if (existing) {
      Object.assign(existing, body, { updated_at: nowIso() });
      return clone(existing);
    }
    const cap = { id: newId("cap"), include_in_team_average: true, working_hours_per_day: 8.5, ...body, created_at: nowIso(), updated_at: nowIso() };
    db().capacities.push(cap);
    return clone(cap);
  }),
  route("PUT", "/efficiency/monthly-capacity/:id", ({ params, body }) => {
    const cap = db().capacities.find((c) => c.id === params.id);
    if (!cap) throw new HttpError(404, "Not found");
    Object.assign(cap, body, { updated_at: nowIso() });
    return clone(cap);
  }),
  route("DELETE", "/efficiency/monthly-capacity/:id", ({ params }) => {
    db().capacities = db().capacities.filter((c) => c.id !== params.id);
    return { message: "Deleted" };
  }),
  route("GET", "/efficiency/employee-targets", ({ query }) => {
    const user = db().users.find((u) => u.id === query.user_id);
    const row = user && query.month ? employeeRow(user, query.month) : null;
    return db()
      .targets.filter((t) => t.user_id === query.user_id)
      .sort((a, b) => a.activity_name.localeCompare(b.activity_name))
      .map((t) => {
        const a = row?.activities.find((x) => x.activity_name === t.activity_name);
        return a ? { ...t, monthly_potential: a.monthly_potential, daily_potential: a.daily_potential } : clone(t);
      });
  }),
  route("POST", "/efficiency/employee-targets", ({ body }) => {
    const existing = db().targets.find((t) => t.user_id === body.user_id && t.activity_name === body.activity_name);
    if (existing) {
      Object.assign(existing, body, { updated_at: nowIso() });
      return clone(existing);
    }
    const target = { id: newId("tg"), active: true, ...body, created_at: nowIso(), updated_at: nowIso() };
    db().targets.push(target);
    return clone(target);
  }),
  route("PUT", "/efficiency/employee-targets/:id", ({ params, body }) => {
    const target = db().targets.find((t) => t.id === params.id);
    if (!target) throw new HttpError(404, "Not found");
    Object.assign(target, body, { updated_at: nowIso() });
    return clone(target);
  }),
  route("DELETE", "/efficiency/employee-targets", ({ query }) => {
    db().targets = db().targets.filter((t) => !(t.user_id === query.user_id && t.activity_name === query.activity_name));
    return { message: "Deleted" };
  }),

  // ---- invoicing
  route("GET", "/invoicing/projects/:id", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (!p || !["Ready for Invoice", "Raised Invoice"].includes(p.status)) throw new HttpError(404, "This project is not in invoicing");
    const lines = invoiceLines(p.id);
    return { ...invoiceMeta(p), categories: invoiceSummary(lines), lines };
  }),
  route("GET", "/invoicing/projects", ({ query }) => {
    const raised = query.tab === "raised";
    const list = (status) => db().projects.filter((p) => p.status === status);
    return {
      tab: raised ? "raised" : "ready",
      counts: { ready: list("Ready for Invoice").length, raised: list("Raised Invoice").length },
      projects: list(raised ? "Raised Invoice" : "Ready for Invoice").map((p) => {
        const summary = invoiceSummary(invoiceLines(p.id));
        return {
          ...invoiceMeta(p),
          counts: Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, v.qty])),
          minutes: Object.values(summary).reduce((n, v) => n + v.minutes, 0),
        };
      }),
    };
  }),
  route("POST", "/invoicing/projects/:id/raise", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (p) {
      p.status = "Raised Invoice";
      p.status_changed_at = nowIso();
      p.invoice_raised_at = nowIso();
    }
    return { message: "Invoice raised" };
  }),
  route("POST", "/invoicing/projects/:id/undo", ({ params }) => {
    const p = db().projects.find((x) => x.id === params.id);
    if (p) {
      p.status = "Ready for Invoice";
      p.status_changed_at = nowIso();
      p.invoice_raised_at = null;
    }
    return { message: "Undone" };
  }),
  route("PUT", "/invoicing/projects/:id/lines/:line_id", ({ params, body }) => {
    const w = findWorkItem(params.line_id);
    if (body.qty !== undefined) w.quantity = body.qty;
    if (body.name !== undefined) w.deliverable_name = body.name;
    return { ok: true };
  }),

  // ---- project tracking sheet
  route("GET", "/project-tasks/history", () => []),
  route("GET", "/project-tasks", () => ({
    tasks: clone(db().projectTasks),
    updates: clone(db().projectTaskUpdates),
    today: todayIso(),
    options: {
      task_types: [
        "Client Meeting",
        "Client Call",
        "Client Follow-up",
        "Client & Internal Follow-up",
        "Internal Follow-up",
        "Internal Review",
        "Internal Briefing",
        "Internal Meeting",
        "Cost Proposal",
        "Quality Check",
        "Vendor Follow-up",
        "Admin",
      ],
      meeting_types: ["Client Call", "Client Meeting", "Internal Briefing", "Internal Meeting"],
      statuses: ["On track", "At risk", "Waiting on client", "Delayed", "Done"],
      teams: ["Content", "Design", "Animation", "Accounts", "Video"],
    },
  })),
  route("POST", "/project-tasks", ({ body }) => {
    const task = {
      id: newId("pt"),
      task: "",
      task_type: "",
      client_id: null,
      project_id: null,
      spoc: "",
      owner_id: actingUser().id,
      collaborator_ids: [],
      follow_up_teams: [],
      follow_up_user_ids: [],
      follow_up_others: "",
      internal_follow_up_date: null,
      client_follow_up_date: null,
      status: "On track",
      delay_reason: "",
      meeting_time: "",
      deliverable_count: 0,
      start_date: body.day || todayIso(),
      done_date: null,
      sort_order: db().projectTasks.length + 1,
      created_at: nowIso(),
      updated_at: nowIso(),
      ...body,
    };
    delete task.day;
    db().projectTasks.push(task);
    return clone(task);
  }),
  route("PATCH", "/project-tasks/:id", ({ params, body }) => {
    const task = db().projectTasks.find((t) => t.id === params.id);
    if (!task) throw new HttpError(404, "Task not found");
    Object.entries(body).forEach(([k, v]) => {
      if (v !== undefined && k !== "day") task[k] = v;
    });
    if (body.status === "Done") task.done_date = body.day || todayIso();
    task.updated_at = nowIso();
    return clone(task);
  }),
  route("DELETE", "/project-tasks/:id", ({ params }) => {
    db().projectTasks = db().projectTasks.filter((t) => t.id !== params.id);
    return { message: "Deleted" };
  }),
  route("PUT", "/project-tasks/:id/updates/:day", ({ params, body }) => {
    const existing = db().projectTaskUpdates.find((u) => u.task_id === params.id && u.day === params.day);
    if (existing) existing.note = body.note;
    else db().projectTaskUpdates.push({ id: newId("pu"), task_id: params.id, day: params.day, note: body.note, user_id: actingUser().id, updated_at: nowIso() });
    return { ok: true };
  }),

  // ---- notifications, push, meetings
  route("GET", "/notifications", () => clone(db().notifications.filter((n) => n.user_id === "u-admin" || n.user_id === actingUser().id))),
  route("POST", "/notifications/read-all", () => {
    db().notifications.forEach((n) => {
      n.read_at = n.read_at || nowIso();
    });
    return { ok: true };
  }),
  route("POST", "/notifications/:id/read", ({ params }) => {
    const n = db().notifications.find((x) => x.id === params.id);
    if (n) n.read_at = nowIso();
    return { ok: true };
  }),
  route("POST", "/notifications/:id/add-row", () => ({ ok: true })),
  route("POST", "/push/register", () => ({ ok: true })),
  route("POST", "/push/unregister", () => ({ ok: true })),
];

// ---------------------------------------------------------------- entry point
export const handleDemoRequest = ({ method, path, query, body }) => {
  const verb = String(method || "get").toUpperCase();
  for (const r of ROUTES) {
    if (r.method !== verb) continue;
    const match = r.regex.exec(path);
    if (!match) continue;
    const params = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(match[i + 1]);
    });
    return r.handler({ params, query: query || {}, body: body || {} });
  }
  const meetings = handleMeetings({ method: verb, path, query: query || {}, body: body || {} });
  if (meetings !== undefined) return meetings;
  const planned = handlePlanning({
    method: verb,
    path,
    query: query || {},
    body: body || {},
    db: db(),
    actingUser: actingUser(),
    HttpError,
    helpers: { newWorkItemFrom },
  });
  if (planned !== undefined) return planned;
  // Anything not modelled answers with an empty, harmless result so a screen
  // that asks for it still renders.
  // eslint-disable-next-line no-console
  console.info(`[demo] no sample data for ${verb} ${path}`);
  return verb === "GET" ? {} : { ok: true };
};

export { DEMO_ROLES, dayOffset };
