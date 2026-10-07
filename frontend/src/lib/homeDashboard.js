// Home dashboard calculations. The server (backend/home_dashboard.py) sends one
// row per deliverable in the month's scope (plus anything due in the next 7
// days), already tagged with its bucket; everything here is slicing and
// counting those rows for the current team view and filters, so switching
// either is instant and needs no request.

export const TEAMS = ["Content", "Design", "Animate"];

// Stage team -> the user department that staffs it (for capacity / stale members).
export const TEAM_DEPARTMENT = { Content: "Content", Design: "Design", Animate: "Animation" };

export const NEXT_STATUSES = ["On track", "At risk", "Delayed", "In review"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const pc = (n, d) => (d ? Math.round((n / d) * 100) : 0);

export const currentMonth = () => new Date().toISOString().slice(0, 7);

export const shiftMonth = (month, delta) => {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

export const monthLabel = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
};

export const monthShort = (month) => MONTHS[Number(month.slice(5, 7)) - 1];

const parse = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
};

// "26 Sep"
export const fmtDay = (iso) => {
  const d = parse(iso);
  return d ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "—";
};

// "Sat 26 Sep"
export const fmtWeekday = (iso) => {
  const d = parse(iso);
  return d ? `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` : "—";
};

export const addDays = (iso, n) => {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const APPROVAL_TYPE_LABEL = {
  MANAGER: "Manager approval",
  LEADERSHIP: "Leadership approval",
  CLIENT_SPOC: "Client approval",
  COMPLIANCE: "Compliance approval",
};

const hoursSince = (iso) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? (Date.now() - t) / 3.6e6 : null;
};

const countBy = (rows, key) => {
  const m = new Map();
  rows.forEach((r) => {
    const k = key(r);
    if (k) m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

// ---------------------------------------------------------------------------

export function buildHome({ data, team, filters, userName }) {
  const projects = data.projects || {};
  const name = (id) => (id ? userName[id] || "Unknown" : "Unassigned");
  const matchesFilters = (r) => {
    const p = projects[r.project_id] || {};
    return (
      (!filters.client || p.client_id === filters.client) &&
      (!filters.project || r.project_id === filters.project) &&
      (!filters.member || r.owner_id === filters.member)
    );
  };

  const all = (data.deliverables || []).filter(matchesFilters);
  const inTeam = (r) => team === "All" || r.stage === team;

  // Work-sheet entries a member marked Ready for Review that the reviewer has
  // not acted on. Not tied to the month (it is a live queue); the same client /
  // project / member filters and team view apply.
  const reviewQueue = (data.reviews || []).filter((w) => {
    const p = projects[w.project_id] || {};
    return (
      (!filters.client || p.client_id === filters.client) &&
      (!filters.project || w.project_id === filters.project) &&
      (!filters.member || w.owner_id === filters.member) &&
      inTeam(w)
    );
  });
  const reviewLate = reviewQueue.filter((w) => (hoursSince(w.since) ?? 0) > 24);
  const approverOf = (approvals = []) => {
    const label = (a) =>
      a.assigned_to ? name(a.assigned_to) : APPROVAL_TYPE_LABEL[a.type] || "Approver not assigned";
    const labels = [...new Set(approvals.map(label))];
    return labels.length ? labels.join(", ") : null;
  };

  // Month scope (rows with a bucket) for the current team view.
  const scoped = all.filter((r) => r.bucket && inTeam(r));
  const by = (b) => scoped.filter((r) => r.bucket === b);
  const on = by("on");
  const risk = by("risk");
  const delay = by("delay");
  const ready = by("ready");
  const billed = by("billed");
  const active = [...on, ...risk, ...delay];
  const total = scoped.length;
  const projectsOf = (rows) => new Set(rows.map((r) => r.project_id)).size;

  // ---- attention signals ----
  const critDays = data.definitions?.critical_late_days ?? 3;
  const crit = delay.filter((r) => (r.days_late ?? 0) >= critDays);
  const attention = [...delay, ...risk];
  const waiting = (r) =>
    r.stage_status === "Ready for Review" ||
    r.stage_status === "Changes Requested" ||
    r.pending_approvals > 0;
  const blocked = attention.filter(waiting);
  const repeated = scoped.filter((r) => r.revisions >= 2);

  const signals = {
    crit: { value: crit.length, den: delay.length },
    block: { value: blocked.length, den: attention.length },
    review: { value: reviewLate.length, den: reviewQueue.length },
    rev: { value: repeated.length, den: total },
  };

  // ---- action queue ----
  const actions = [];
  crit.forEach((r) =>
    actions.push({
      key: `crit-${r.id}`, pri: "Critical", cat: "crit", team: r.stage, row: r,
      title: `${r.name} is ${r.days_late} day${r.days_late === 1 ? "" : "s"} behind`,
      evidence: `${r.stage} · was due ${fmtDay(r.due)} · ${projects[r.project_id]?.name || ""}`,
      owner: name(r.owner_id), approver: null, by: "Today", age: `${r.days_late}d`, sort: r.days_late,
    })
  );
  blocked.forEach((r) => {
    const changes = r.stage_status === "Changes Requested";
    actions.push({
      key: `block-${r.id}`, pri: "High", cat: "block", team: r.stage, row: r,
      title: changes ? `${r.name} needs changes` : `${r.name} is waiting on approval`,
      evidence: changes
        ? `${r.stage} · changes requested · ${r.revisions} revision${r.revisions === 1 ? "" : "s"}`
        : `${r.stage} · ${r.pending_approvals || 1} approval${r.pending_approvals > 1 ? "s" : ""} pending · due ${fmtDay(r.due)}`,
      owner: name(r.owner_id), approver: approverOf(r.approvals) || (changes ? null : "Approver not assigned"),
      by: "Tomorrow",
      age: r.days_late ? `${r.days_late}d` : "—", sort: r.days_late || 0,
    });
  });
  reviewLate.forEach((w) => {
    const h = Math.round(hoursSince(w.since));
    actions.push({
      key: `review-${w.id}`, pri: "Medium", cat: "review", team: w.stage, row: w,
      title: `${w.name} is waiting for review`,
      evidence: `${w.stage || "No stage"} · ${h}h since marked ready · ${projects[w.project_id]?.name || "No project"}`,
      owner: name(w.owner_id), approver: name(w.reviewer_id), by: "Within 24h",
      age: h >= 72 ? `${Math.round(h / 24)}d` : `${h}h`, sort: h / 24,
    });
  });
  repeated.forEach((r) =>
    actions.push({
      key: `rev-${r.id}`, pri: r.revisions >= 3 ? "Medium" : "Watch", cat: "rev", team: r.stage, row: r,
      title: `Resolve repeated revisions on ${r.name}`,
      evidence: `${r.revisions} revisions · ${r.stage} · ${name(r.owner_id)}`,
      owner: name(r.owner_id), approver: approverOf(r.approvals), by: "This week", age: `${r.revisions} rev.`, sort: r.revisions,
    })
  );
  const PRI = { Critical: 0, High: 1, Medium: 2, Watch: 3 };
  actions.sort((a, b) => PRI[a.pri] - PRI[b.pri] || a.sort - b.sort);

  // ---- next 7 days (relative to today, not the viewed month) ----
  const next = all
    .filter((r) => r.next_status && inTeam(r))
    .filter((r) => !filters.status || r.next_status === filters.status)
    .sort((a, b) => (a.final_due < b.final_due ? -1 : a.final_due > b.final_due ? 1 : 0));
  const nextCount = (s) => next.filter((r) => r.next_status === s).length;

  // ---- delay attribution (all teams, so shares add up) ----
  const delayAll = all.filter((r) => r.bucket === "delay");
  const delayTeams = TEAMS.map((t) => {
    const rows = delayAll.filter((r) => r.stage === t);
    const [person] = countBy(rows, (r) => r.owner_id);
    const [client] = countBy(rows, (r) => projects[r.project_id]?.client_name);
    const [project] = countBy(rows, (r) => projects[r.project_id]?.name);
    return {
      team: t,
      count: rows.length,
      share: pc(rows.length, delayAll.length),
      person: person ? { name: name(person[0]), n: person[1] } : null,
      client: client ? { name: client[0], n: client[1] } : null,
      project: project ? { name: project[0], n: project[1] } : null,
    };
  }).filter((d) => team === "All" || d.team === team);

  // ---- portfolio health ----
  const byProject = new Map();
  scoped.forEach((r) => {
    if (!byProject.has(r.project_id)) byProject.set(r.project_id, []);
    byProject.get(r.project_id).push(r);
  });
  const portfolio = [...byProject.entries()]
    .map(([pid, rows]) => {
      const n = (b) => rows.filter((r) => r.bucket === b).length;
      const act = n("on") + n("risk") + n("delay");
      const review = reviewQueue.filter((w) => w.project_id === pid).length;
      const score = n("risk") * 2 + n("delay") * 3 + review;
      return {
        id: pid,
        name: projects[pid]?.name || "—",
        client: projects[pid]?.client_name || "",
        active: act,
        risk: n("risk"),
        delay: n("delay"),
        review,
        onTime: pc(rows.length - n("delay"), rows.length),
        score,
        level: score >= 5 ? "High" : score >= 2 ? "Watch" : "Healthy",
      };
    })
    .sort((a, b) => b.score - a.score || b.active - a.active || a.name.localeCompare(b.name));

  // ---- quality ----
  const revTotal = scoped.reduce((s, r) => s + (r.revisions || 0), 0);
  const quality = {
    changes: { value: scoped.filter((r) => r.revisions > 0).length, den: total },
    reworkDelays: { value: delay.filter((r) => r.revisions > 0).length, den: delay.length },
    avgRevisions: total ? revTotal / total : 0,
  };

  return {
    total, active, on, risk, delay, ready, billed, projectsOf,
    projectCount: projectsOf(scoped),
    signals, actions, next, nextCount, delayAll, delayTeams, portfolio, quality,
  };
}

// ---------------------------------------------------------------------------
// Team activity tab ("Who is doing what right now?")
//
// One row per tracked member. Live data, so it follows today's date rather
// than the month being viewed; the team view and the client / project / member
// filters still apply. Sources:
//   activity            (GET /dashboard/team-activity) minutes logged today / this week, the latest work-sheet
//                       entry of today, the last few entries
//   data.deliverables   what each person owns, what is late, what is waiting
//
// State of a person (first match wins):
//   blocked  owns an at-risk or delayed deliverable that is waiting on a
//            review, an approval or requested changes - same rule as the
//            Actions tab's "blocked" signal
//   review   latest entry today is marked Ready for Review
//   busy     logged something today
//   idle     nothing logged today
// There is no leave data on the server, so nobody is shown as "away".

export const ACTIVITY_FILTERS = [
  ["all", "Everyone"],
  ["working", "Working now"],
  ["delayed", "Has delays"],
  ["blocked", "Blocked"],
  ["over", "Over capacity"],
  ["idle", "Not logged today"],
];

const STATE_ORDER = { blocked: 0, busy: 1, review: 2, idle: 3 };

export const formatMins = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  if (total <= 0) return "0m";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${String(m).padStart(2, "0")}m`;
  return h ? `${h}h` : `${m}m`;
};

export function buildTeamActivity({ data, activity = {}, team, filters = {}, userName = {} }) {
  const projects = data.projects || {};
  const expected = activity.week_expected_minutes || 0;
  const byUser = new Map((activity.members || []).map((m) => [m.user_id, m]));
  const tracked = data.members?.tracked || [];

  const stageOfDepartment = (dept) =>
    Object.keys(TEAM_DEPARTMENT).find((t) => TEAM_DEPARTMENT[t] === dept) || null;

  const rowOk = (r) => {
    const p = projects[r.project_id] || {};
    return (
      (!filters.client || p.client_id === filters.client) &&
      (!filters.project || r.project_id === filters.project)
    );
  };

  const isActive = (r) =>
    ["on", "risk", "delay"].includes(r.bucket) || (!r.bucket && r.next_status);
  const isDelayed = (r) => r.bucket === "delay" || r.next_status === "Delayed";
  const isWaiting = (r) =>
    r.stage_status === "Ready for Review" ||
    r.stage_status === "Changes Requested" ||
    r.pending_approvals > 0;
  const dueOf = (r) => r.due || r.final_due || "9999-12-31";

  const rowStatus = (r) => {
    if (isDelayed(r)) return "Delayed";
    if (r.stage_status === "Ready for Review") return "In review";
    if (r.bucket === "risk" || r.next_status === "At risk") return "At risk";
    return "On track";
  };

  const everyone = tracked
    .filter((u) => !filters.member || u.id === filters.member)
    .map((u) => {
      const live = byUser.get(u.id) || {};
      const teamName = stageOfDepartment(u.department);
      const owned = (data.deliverables || [])
        .filter((r) => r.owner_id === u.id && isActive(r) && rowOk(r))
        .sort((a, b) => (dueOf(a) < dueOf(b) ? -1 : dueOf(a) > dueOf(b) ? 1 : 0));
      const late = owned.filter(isDelayed).sort((a, b) => (b.days_late || 0) - (a.days_late || 0));
      const waiting = owned.filter((r) => (r.bucket === "delay" || r.bucket === "risk") && isWaiting(r));

      const now = live.now || null;
      let state = "idle";
      if (now) state = now.status === "Ready for Review" ? "review" : "busy";
      if (waiting.length) state = "blocked";

      const nowName = now?.name || "";
      const next = owned.find((r) => r.name !== nowName) || null;
      const load = pc(live.week_minutes || 0, expected);

      let delayText = "";
      if (late.length) {
        const r = late[0];
        delayText = `${r.name} · ${r.days_late ? `${r.days_late}d behind` : "past due"}`;
      } else if (waiting.length) {
        const r = waiting[0];
        delayText = `${r.name} · ${
          r.stage_status === "Changes Requested" ? "changes requested" : "waiting on approval"
        }`;
      }

      return {
        id: u.id,
        name: u.name || userName[u.id] || "Unknown",
        team: teamName,
        state,
        now: now
          ? {
              name: now.name,
              meta: [now.project, now.minutes > 0 ? `${formatMins(now.minutes)} so far` : ""]
                .filter(Boolean)
                .join(" · "),
            }
          : null,
        todayMinutes: live.today_minutes || 0,
        load,
        delays: late.length,
        delayText,
        next: next
          ? { name: next.name, due: next.due || next.final_due, project: projects[next.project_id]?.name || "" }
          : null,
        upcoming: owned.slice(0, 4).map((r) => ({
          key: r.id,
          name: r.name,
          meta: `${projects[r.project_id]?.name || "No project"} · due ${fmtDay(r.due || r.final_due)}`,
          status: rowStatus(r),
        })),
        recent: (live.recent || []).map((w, i) => ({
          key: `${w.date}-${i}`,
          name: w.name,
          meta: [w.project, w.minutes > 0 ? formatMins(w.minutes) : "", w.date ? fmtDay(w.date) : ""]
            .filter(Boolean)
            .join(" · "),
          status: w.status || "Not Started",
        })),
      };
    })
    .filter((p) => team === "All" || p.team === team);

  const tests = {
    all: () => true,
    working: (p) => p.state === "busy" || p.state === "review",
    delayed: (p) => p.delays > 0,
    blocked: (p) => p.state === "blocked",
    over: (p) => p.load > 100,
    idle: (p) => p.state === "idle",
  };

  const count = (key) => everyone.filter(tests[key]).length;

  return {
    everyone,
    tests,
    count,
    total: everyone.length,
    workingDay: activity.working_day !== false,
    sort: (list) =>
      [...list].sort(
        (a, b) =>
          (b.delays > 0) - (a.delays > 0) ||
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          b.load - a.load ||
          a.name.localeCompare(b.name)
      ),
  };
}