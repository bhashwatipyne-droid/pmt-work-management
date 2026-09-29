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
  const reviewQueue = scoped.filter(
    (r) => r.stage_status === "Ready for Review" && r.bucket !== "billed" && r.bucket !== "ready"
  );
  const reviewLate = reviewQueue.filter((r) => (hoursSince(r.review_since) ?? 0) > 24);
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
      owner: name(r.owner_id), by: "Today", age: `${r.days_late}d`, sort: r.days_late,
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
      owner: name(r.owner_id), by: "Tomorrow",
      age: r.days_late ? `${r.days_late}d` : "—", sort: r.days_late || 0,
    });
  });
  reviewLate.forEach((r) => {
    const h = Math.round(hoursSince(r.review_since));
    actions.push({
      key: `review-${r.id}`, pri: "Medium", cat: "review", team: r.stage, row: r,
      title: `Close review on ${r.name}`,
      evidence: `${h}h waiting · reviewer ${r.reviewer_id ? name(r.reviewer_id) : "managers"}`,
      owner: r.reviewer_id ? name(r.reviewer_id) : name(r.owner_id), by: "Within 24h",
      age: h >= 72 ? `${Math.round(h / 24)}d` : `${h}h`, sort: h / 24,
    });
  });
  repeated.forEach((r) =>
    actions.push({
      key: `rev-${r.id}`, pri: r.revisions >= 3 ? "Medium" : "Watch", cat: "rev", team: r.stage, row: r,
      title: `Resolve repeated revisions on ${r.name}`,
      evidence: `${r.revisions} revisions · ${r.stage} · ${name(r.owner_id)}`,
      owner: name(r.owner_id), by: "This week", age: `${r.revisions} rev.`, sort: r.revisions,
    })
  );
  const PRI = { Critical: 0, High: 1, Medium: 2, Watch: 3 };
  actions.sort((a, b) => PRI[a.pri] - PRI[b.pri] || b.sort - a.sort);

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
      const review = rows.filter(
        (r) => r.stage_status === "Ready for Review" && ["on", "risk", "delay"].includes(r.bucket)
      ).length;
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
