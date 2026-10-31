// Sample data for Planning: the team's week as a Gantt, the "assigned to me"
// task cards and the held WhatsApp lines, built from the demo workspace.
// (In the real app these come from WhatsApp tasklists matched to projects.)

import { todayIso, dayOffset } from "./seed";

const DAY_START = 9.5;
const DAY_END = 18;
const STAGE_DEPT = { Content: "Content", Design: "Design", Animate: "Animation" };
const MEMBERS = {
  Content: ["u-c1", "u-c2", "u-c3", "u-mgr-content"],
  Design: ["u-d1", "u-d2", "u-d3", "u-mgr-design"],
  Animate: ["u-a1", "u-a2", "u-mgr-anim"],
};
const EST_BY_TYPE = {
  Carousel: 3, Poster: 2, Newsletters: 4, Emailers: 2.5, "Two Pager": 5, Brochure: 6, Booklet: 7,
  Teaser: 6, GIF: 2.5, "Reel / Short Video": 8, "Long Video": 12, "One Pager / Infographic": 4,
  "Presentation (PPT) - Per Slide": 5,
};

const dayLabel = (d) => `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.getDate()}`;
const longDay = (d) => `${d.toLocaleDateString("en-GB", { weekday: "long" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "short" })}`;
const atNoon = (iso) => new Date(`${iso}T12:00:00`);

const weekOf = (iso) => {
  const day = atNoon(iso);
  const monday = new Date(day);
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  const days = [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const now = new Date();
  const hour = Math.min(Math.max(now.getHours() + now.getMinutes() / 60, 10.25), 17.25);
  return {
    monday,
    ctx: {
      date: iso,
      days: days.map(dayLabel),
      today: Math.min((day.getDay() + 6) % 7, 4),
      now: Math.round(hour * 100) / 100,
      hours_per_day: DAY_END - DAY_START,
      week_label: `${dayLabel(days[0])} - ${dayLabel(days[4])} ${days[4].toLocaleDateString("en-GB", { month: "short" })}`,
      today_label: longDay(day),
      holiday: null,
      past: false,
    },
  };
};

// ------------------------------------------------------------ the plan
const buildPlan = (db) => {
  const today = todayIso();
  const { ctx } = weekOf(today);
  const todayIdx = ctx.today;
  const nameOf = Object.fromEntries(db.users.map((u) => [u.id, u.name]));
  const projectOf = Object.fromEntries(db.projects.map((p) => [p.id, p]));
  const rows = [];
  const loadOf = {};
  const turn = { Content: 0, Design: 0, Animate: 0 };

  db.deliverables.forEach((d, i) => {
    if (d.stage_status === "Completed") return;
    const project = projectOf[d.project_id];
    if (!project || ["Completed", "Raised Invoice", "Ready for Invoice", "On Hold"].includes(project.status)) return;
    const stage = d.current_stage;
    const pool = MEMBERS[stage];
    const owner = pool[turn[stage] % pool.length];
    turn[stage] += 1;
    const window = (d.stage_schedule || {})[stage] || {};
    const late = window.end_dt && window.end_dt < today && d.stage_status !== "Not Started";
    let cat = "new";
    let note = "Assigned this week";
    let d0 = Math.min(todayIdx, Math.max(0, i % 5));
    let d1 = d0;
    if (d.stage_status === "Ready for Review") {
      cat = "review";
      note = "Waiting for review";
      d0 = Math.max(0, todayIdx - 1);
      d1 = todayIdx;
    } else if (d.stage_status === "Changes Requested") {
      cat = "changes";
      note = "Changes requested";
      d0 = Math.max(0, todayIdx - 2);
      d1 = todayIdx;
    } else if (late) {
      cat = "rolled";
      const behind = Math.max(1, Math.round((atNoon(today) - atNoon(window.end_dt)) / 86400000));
      note = `${behind}d late`;
      d0 = Math.max(0, todayIdx - Math.min(behind, 3));
      d1 = todayIdx;
    } else if (d.stage_status === "Not Started") {
      note = "Starts soon";
      d0 = d1 = Math.min(4, todayIdx + (i % 2));
    } else {
      d0 = Math.max(0, todayIdx - (i % 3));
      d1 = Math.min(4, d0 + (i % 2));
      cat = "new";
      note = i % 2 ? "Assigned Mon" : "Assigned this morning";
    }
    rows.push({
      id: `pl-${d.id}-${stage}`,
      who: nameOf[owner],
      task: `${d.name}${stage === "Content" ? " - copy" : stage === "Design" ? " - design" : " - animation"}`,
      deliverable: d.name,
      deliverable_type: d.type,
      project_id: project.id,
      deliverable_id: d.id,
      proj: project.name,
      d0,
      d1,
      est: EST_BY_TYPE[d.type] || 3,
      cat,
      note,
      sh: DAY_START,
      status: d.stage_status === "Ready for Review" || d.stage_status === "Changes Requested" ? "todo" : d.stage_status === "In Progress" ? "wip" : "todo",
    });
  });

  // a few finished items earlier in the week, and extra work people logged themselves
  const extras = [
    ["u-c1", "Weekly newsletter proofread", "Savora Foods - Festive Campaign", "Newsletters", 1.5, 0, "done"],
    ["u-d2", "Brand asset clean-up", "Orbit Learning - Course Marketing", "Poster", 2, 1, "done"],
    ["u-a1", "Logo sting export", "Lumen Health - Wellness Month", "GIF", 1, 1, "done"],
    ["u-c2", "Client call notes", "Lumen Health - Wellness Month", "Emailers", 1, 2, "planned"],
    ["u-d3", "Social resize pack", "Q3 Investor Awareness Series", "Carousel", 2.5, 2, "planned"],
  ];
  extras.forEach(([who, task, proj, type, est, dayIdx, kind], i) => {
    rows.push({
      id: `pl-x${i}`,
      who: nameOf[who],
      task,
      deliverable: task,
      deliverable_type: type,
      project_id: null,
      deliverable_id: null,
      proj,
      d0: Math.min(dayIdx, todayIdx),
      d1: Math.min(dayIdx, todayIdx),
      est,
      cat: "planned",
      note: kind === "done" ? "Logged and closed" : "Logged on the Work Sheet",
      sh: DAY_START,
      status: kind === "done" ? "done" : "todo",
      src: "work_sheet",
    });
  });

  // today's bars stack one after another from the start of the day
  const byPerson = {};
  rows.forEach((r) => {
    if (r.d0 <= todayIdx && todayIdx <= r.d1) (byPerson[r.who] = byPerson[r.who] || []).push(r);
  });
  Object.values(byPerson).forEach((list) => {
    let cursor = DAY_START;
    list.forEach((r) => {
      r.sh = Math.round(cursor * 100) / 100;
      cursor += r.est / (r.d1 - r.d0 + 1);
      loadOf[r.who] = cursor;
    });
  });
  return rows;
};

const peopleOf = (db, actingUser) =>
  db.users
    .filter((u) => ["member", "manager"].includes(u.role) && u.active !== false)
    .filter((u) => actingUser.role !== "manager" || u.department === actingUser.department)
    .map((u) => ({ id: u.id, name: u.name, dept: u.department }));

// ------------------------------------------------------------ task cards
const buildCards = () => [
  {
    id: "card-1",
    from: "Kabir Shah",
    role: "Content manager",
    ago: "12 min ago",
    pri: "P1",
    task: "Scholarship FAQ - 8 questions",
    proj: "Orbit Learning - Scholarship Push",
    client: "Orbit Learning",
    est: 2.5,
    qty: "8 questions",
    note: "Draft the eligibility FAQ in plain language. Keep each answer under 40 words.",
    load: 5.5,
    due: "Today · 5:00 PM",
    dueIn: "in 3h",
    dueTone: "urgent",
  },
  {
    id: "card-2",
    from: "Naina Rao",
    role: "Design manager",
    ago: "1h ago",
    pri: "P2",
    task: "Festive carousel - revised cover",
    proj: "Savora Foods - Festive Campaign",
    client: "Savora Foods",
    est: 1.5,
    qty: "1 slide",
    note: "Client wants a warmer palette on the cover. Rest of the carousel stays as approved.",
    load: 5.5,
    due: "Mon 2 Nov · 1:00 PM",
    dueIn: "in 2 days",
    dueTone: "ok",
  },
];

// ------------------------------------------------------------ held lines
const buildHeld = () => [
  {
    id: "held-1",
    status: "needs_review",
    work_date: todayIso(),
    team: "content",
    assignee_name: "Ishaan",
    assignee_user_id: "u-c1",
    assignee_pmt_name: "Ishaan Verma",
    raw_line: "Ishaan - orbit newsletter, 2 variants, by Tue",
    client_id: "c-orbit",
    client_name: "Orbit Learning",
    project_id: null,
    project_name: "Orbit Learning - Course Marketing",
    project_text: "orbit newsletter",
    deliverable_name: null,
    deliverable_id: null,
    priority: "normal",
    confidence: { project: 0.62 },
    alternatives: [{ project: "Orbit Learning - Scholarship Push" }],
    review_reasons: ["Ambiguous project: two Orbit Learning projects match"],
    nlp_ids: [],
    decline_reason: null,
    decline_message: null,
    questions: [],
    assigned_by_name: "Kabir Shah",
    assigned_by_user_id: "u-mgr-content",
    created_at: `${todayIso()}T08:40:00+00:00`,
    deliverable_type: "Newsletters",
  },
  {
    id: "held-2",
    status: "needs_review",
    work_date: todayIso(),
    team: "design",
    assignee_name: "Anika",
    assignee_user_id: "u-d1",
    assignee_pmt_name: "Anika Sen",
    raw_line: "Anika - wellness poster resize for print",
    client_id: "c-lumen",
    client_name: "Lumen Health",
    project_id: null,
    project_name: null,
    project_text: "wellness poster",
    deliverable_name: null,
    deliverable_id: null,
    priority: "high",
    confidence: { project: 0 },
    alternatives: [],
    review_reasons: ["No project matched"],
    nlp_ids: [],
    decline_reason: null,
    decline_message: null,
    questions: [],
    assigned_by_name: "Naina Rao",
    assigned_by_user_id: "u-mgr-design",
    created_at: `${todayIso()}T09:05:00+00:00`,
    deliverable_type: "Poster",
  },
];

const LEARNED = [
  { id: "lr-1", kind: "project", example: "festive recipes", project_name: "Savora Foods - Festive Campaign", client_name: "Savora Foods", count: 6, disabled: false },
  { id: "lr-2", kind: "project", example: "sip myths", project_name: "Q3 Investor Awareness Series", client_name: "Bluepeak Mutual Fund", count: 4, disabled: false },
  { id: "lr-3", kind: "client", example: "aster launch", project_name: null, client_name: "Aster Bank", count: 3, disabled: false },
];

// ------------------------------------------------------------ routes
export const handlePlanning = ({ method, path, body, db, actingUser, HttpError, helpers }) => {
  if (!path.startsWith("/planning")) return undefined;
  const state = (db.planning = db.planning || { tasks: null, cards: buildCards(), held: buildHeld(), rules: LEARNED.map((r) => ({ ...r })) });
  if (!state.tasks) state.tasks = buildPlan(db);
  const isProducer = ["member", "manager"].includes(actingUser.role);

  if (method === "GET") {
    if (path === "/planning/overview") {
      return { ctx: weekOf(todayIso()).ctx, tasks: JSON.parse(JSON.stringify(state.tasks)), people: peopleOf(db, actingUser) };
    }
    if (path === "/planning/my-tasks") {
      if (!isProducer) throw new HttpError(403, "Only team members have task cards");
      return JSON.parse(JSON.stringify(state.cards));
    }
    if (path === "/planning/review") return JSON.parse(JSON.stringify(state.held));
    if (path === "/planning/learned-rules") return JSON.parse(JSON.stringify(state.rules));
    if (path === "/planning/assignable") {
      return db.users.filter((u) => ["member", "manager"].includes(u.role)).map((u) => ({ id: u.id, name: u.name }));
    }
    if (path === "/planning/deliverable-types") return ["Newsletters", "Emailers", "Carousel", "Poster", "Teaser", "GIF"];
    return [];
  }

  let m = /^\/planning\/tasks\/([^/]+)\/reassign$/.exec(path);
  if (m) {
    const task = state.tasks.find((t) => t.id === m[1]);
    const target = db.users.find((u) => u.id === body.to_user_id);
    if (task && target) task.who = target.name;
    return { ok: true };
  }
  if (/^\/planning\/tasks\/[^/]+\/correct$/.test(path)) return { ok: true };

  m = /^\/planning\/my-tasks\/([^/]+)\/(accept|decline|ask)$/.exec(path);
  if (m) {
    const card = state.cards.find((c) => c.id === m[1]);
    if (m[2] === "accept" && card) {
      db.workItems.push(
        helpers.newWorkItemFrom({
          deliverable_name: card.task,
          deliverable_type: /newsletter|faq/i.test(card.task) ? "Newsletters" : "Carousel",
          time_taken_minutes: Math.round(card.est * 60),
          remarks: card.note,
          status: "Not Started",
          work_date: todayIso(),
        })
      );
    }
    if (m[2] !== "ask") state.cards = state.cards.filter((c) => c.id !== m[1]);
    return { ok: true };
  }

  m = /^\/planning\/review\/([^/]+)\/(resolve|reject)$/.exec(path);
  if (m) {
    state.held = state.held.filter((h) => h.id !== m[1]);
    return { ok: true };
  }
  if (path === "/planning/learned-rules/disabled") {
    const rule = state.rules.find((r) => r.id === body.id);
    if (rule) rule.disabled = !!body.disabled;
    return { ok: true };
  }
  return { ok: true };
};

export { dayOffset };
