// Planning screen maths, ported from the design prototype (planVals). Pure: it
// takes the task list plus the current filters and returns everything the
// screen draws, so it can be tested without React and so the screen does not
// care whether the tasks came from the sample data or from the backend.
import {
  P_CATS,
  P_DAYS as SEED_DAYS,
  P_HPD as SEED_HPD,
  P_NOW as SEED_NOW,
  P_ORDER,
  P_PEOPLE as SEED_PEOPLE,
  P_TODAY as SEED_TODAY,
} from "./seed";

export const initials = (name) =>
  String(name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

export const fmtH = (h) => {
  const m = Math.round(h * 60);
  return Math.floor(m / 60) + "h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") + "m" : "");
};

const round = Math.round;
const first = (n) => n.split(" ")[0];

// Schedule bars: the least width a bar gets (share of the row) and the height of
// one line of them (two lines of label fit in a bar).
const MIN_BAR = 0.1;
const LANE_H = 44;
export const BAR_H = 38;

export const DEPT_FILTERS = ["all", "Content", "Design", "Animation"];

export const taskFromRow = (t, i) => ({
  id: i + 1,
  who: t[0],
  task: t[1],
  proj: t[2],
  d0: t[3],
  d1: t[4],
  est: t[5],
  cat: t[6],
  note: t[7],
  sh: t[8],
  status: t[9],
});

// `people` ([name, dept, onTime%, feedback, revisions, leaveDays][]) and `ctx`
// (the week/today description from /api/planning/overview) default to the sample
// data, so the maths can still be exercised without a backend.
export function computePlan(
  tasks,
  { period = "today", cat = "all", dept = "all", dismissed = {}, people: peopleRows, ctx } = {}
) {
  const P_PEOPLE = peopleRows || SEED_PEOPLE;
  const P_DAYS = ctx?.days || SEED_DAYS;
  const P_TODAY = ctx ? ctx.today : SEED_TODAY;
  const P_NOW = ctx ? ctx.now : SEED_NOW;
  const P_HPD = ctx ? ctx.hours_per_day : SEED_HPD;
  const week = period === "week";
  const span = (t) => t.d1 - t.d0 + 1;
  const todayH = (t) => (t.d0 <= P_TODAY && t.d1 >= P_TODAY ? t.est / span(t) : 0);
  const inP = (t) => week || (t.d0 <= P_TODAY && t.d1 >= P_TODAY);
  const hrs = (t) => (week ? t.est : todayH(t));
  const periodWord = week ? "this week" : "today";

  const people = P_PEOPLE.filter((p) => dept === "all" || p[1] === dept);
  const names = new Set(people.map((p) => p[0]));
  const all = tasks.filter((t) => inP(t) && names.has(t.who));

  const potOf = (p) => (week ? P_HPD * (5 - p[5].length) : p[5].includes(P_TODAY) ? 0 : P_HPD);
  const loadOf = (p) => {
    const a = tasks.filter((t) => t.who === p[0] && inP(t)).reduce((s, t) => s + hrs(t), 0);
    const pot = potOf(p);
    return {
      p,
      a,
      pot,
      pct: pot ? (a / pot) * 100 : 0,
      exp: pot ? round(Math.min((a / pot) * 100, 100) * (p[2] / 100)) : 0,
    };
  };
  const loads = people.map(loadOf);
  const loadC = (pct) =>
    pct > 105
      ? ["var(--error-500)", "rgb(153,27,27)", "Over potential"]
      : pct >= 75
        ? ["var(--success-500)", "rgb(0,91,75)", "On target"]
        : ["var(--warning-500)", "rgb(146,64,14)", "Under-used"];

  // ---- schedule (gantt) ----
  const lo = week ? 0 : 9.5;
  const hi = week ? 5 : 18;
  const pos = (x) => ((Math.max(lo, Math.min(hi, x)) - lo) / (hi - lo)) * 100;
  const ticks = week
    ? P_DAYS.map((d, i) => ({ left: pos(i) + "%", label: d }))
    : [10, 11, 12, 13, 14, 15, 16, 17].map((x) => ({ left: pos(x) + "%", label: x + ":00" }));

  const rows = loads.map((L) => {
    const mine = all
      .filter((t) => t.who === L.p[0])
      .map((t) => {
        // A bar is never drawn narrower than MIN_BAR of the row, so its name stays
        // readable; a task that starts near (or after) the end of the day is
        // pulled back to fit. Bars that then overlap go on their own line.
        const minSpan = (hi - lo) * MIN_BAR;
        const s = Math.min(week ? t.d0 : t.sh, hi - minSpan);
        const e = Math.min(hi, Math.max(s + minSpan, week ? t.d1 + 1 : s + todayH(t)));
        return { t, s, e };
      })
      .sort((a, b) => a.s - b.s);
    const lanes = [];
    mine.forEach((b) => {
      let l = lanes.findIndex((end) => end <= b.s + 0.01);
      if (l < 0) {
        l = lanes.length;
        lanes.push(0);
      }
      lanes[l] = b.e;
      b.lane = l;
    });
    const c = loadC(L.pct);
    return {
      name: L.p[0],
      ini: initials(L.p[0]),
      dept: L.p[1],
      away: L.pot === 0,
      loadTxt: L.pot ? fmtH(L.a) + " of " + fmtH(L.pot) : "On leave",
      pct: L.pot ? round(L.pct) + "%" : "–",
      barW: Math.min(100, L.pct) + "%",
      barC: c[0],
      pctFg: c[1],
      h: 12 + Math.max(1, lanes.length) * LANE_H + "px",
      bars: mine.map((b) => {
        const k = P_CATS[b.t.cat];
        const ps = pos(b.s);
        const pe = pos(b.e);
        const done = b.t.status === "done";
        return {
          id: b.t.id,
          label: b.t.task,
          title:
            b.t.task + " · " + b.t.proj + " · " + fmtH(hrs(b.t)) + " · " + k[0] + (b.t.note ? " · " + b.t.note : ""),
          left: "calc(" + ps + "% + 2px)",
          width: "calc(" + (pe - ps) + "% - 4px)",
          top: 6 + b.lane * LANE_H + "px",
          bg: done ? "var(--success-100)" : k[1],
          fg: done ? "rgb(0,91,75)" : k[2],
          ring: done ? "inset 0 0 0 1px rgb(110,231,183)" : k[3],
          op: cat !== "all" && b.t.cat !== cat ? "0.25" : "1",
          done,
        };
      }),
    };
  });

  // ---- summary tiles ----
  const sumH = (l) => fmtH(l.reduce((s, t) => s + hrs(t), 0));
  const tileLbl = {
    new: week ? "Assigned this week" : "Assigned today",
    planned: week ? "Extra work this week" : "Extra work today",
    rolled: "Rolled over / delayed",
    resched: "Rescheduled",
    reprio: "Reprioritised",
  };
  const tileSub = {
    new: "Tasks assigned through WhatsApp",
    planned: "Added in the Work Sheet, beyond assigned tasks",
    rolled: week ? "Carried from last week or late" : "Carried from yesterday or late",
    resched: "Moved in from another date",
    reprio: "Priority changed",
  };
  const tiles = [
    ["all", "All tasks", "Everything scheduled " + periodWord, "var(--neutral-900)"],
    ...P_ORDER.map((k) => [k, tileLbl[k], tileSub[k], P_CATS[k][4]]),
  ].map(([k, label, sub, dot]) => {
    const l = k === "all" ? all : all.filter((t) => t.cat === k);
    return { key: k, label, sub, dot, n: l.length, hrs: sumH(l), sel: cat === k };
  });

  // ---- expected efficiency ----
  const tA = loads.reduce((s, l) => s + l.a, 0);
  const tP = loads.reduce((s, l) => s + l.pot, 0);
  const tExp = tP
    ? round((loads.reduce((s, l) => s + Math.min(l.a, l.pot) * (l.p[2] / 100), 0) / tP) * 100)
    : 0;
  const eff = [...loads]
    .sort((a, b) => b.pct - a.pct)
    .map((L) => {
      const c = loadC(L.pct);
      return {
        name: L.p[0],
        meta: L.pot ? fmtH(L.a) + " assigned of " + fmtH(L.pot) : "On leave " + periodWord,
        load: L.pot ? round(L.pct) + "%" : "–",
        exp: L.pot ? L.exp + "%" : "–",
        fill: Math.min(125, L.pct) / 1.25 + "%",
        barC: c[0],
        tag: L.pot ? c[2] : "On leave",
        tagFg: L.pot ? c[1] : "var(--neutral-500)",
        why: "On-time " + L.p[2] + "% · feedback " + L.p[3] + "/5",
      };
    });

  // ---- suggestions ----
  const ins = [];
  const moved = new Set();
  loads
    .filter((l) => l.pct > 105)
    .sort((a, b) => b.pct - a.pct)
    .forEach((o) => {
      const cands = tasks
        // Rows the person typed into their own Work Sheet are theirs to move
        // (there is no WhatsApp task to reassign), so they are never suggested.
        .filter((t) => t.who === o.p[0] && inP(t) && t.status !== "done" && t.cat !== "rolled" && t.src !== "worksheet")
        .sort((a, b) => hrs(a) - hrs(b));
      for (const t of cands) {
        const key = "mv" + t.id;
        if (dismissed[key]) continue;
        const tgt = loads
          .filter(
            (l) =>
              l.p[1] === o.p[1] &&
              l.p !== o.p &&
              l.pot > 0 &&
              ((l.a + hrs(t)) / l.pot) * 100 <= 95 &&
              !moved.has(l.p[0])
          )
          .sort((a, b) => b.p[2] - a.p[2] || a.pct - b.pct)[0];
        if (!tgt) continue;
        moved.add(tgt.p[0]);
        ins.push({
          key,
          icon: "shuffle",
          tone: "var(--brand-50)",
          toneFg: "var(--brand-500)",
          title: "Move “" + t.task + "” to " + tgt.p[0],
          body:
            first(o.p[0]) + " is at " + round(o.pct) + "% of potential " + periodWord + ". " +
            first(tgt.p[0]) + " has " + fmtH(tgt.pot - tgt.a) + " free and delivers " + tgt.p[2] + "% on time.",
          factors: [
            "Qty vs potential " + round(o.pct) + "% → " + round(((o.a - hrs(t)) / o.pot) * 100) + "%",
            first(tgt.p[0]) + " " + round(tgt.pct) + "% → " + round(((tgt.a + hrs(t)) / tgt.pot) * 100) + "%",
            "Client feedback " + tgt.p[3] + "/5",
          ],
          action: "Reassign",
          act: { type: "reassign", taskId: t.id, to: tgt.p[0], from: o.p[0], task: t.task },
        });
        break;
      }
    });
  loads
    .filter((l) => l.p[2] < 75 && all.some((t) => t.who === l.p[0] && t.cat === "rolled"))
    .sort((a, b) => a.p[2] - b.p[2])
    .slice(0, 1)
    .forEach((l) => {
      const key = "rk" + l.p[0];
      if (dismissed[key]) return;
      const t = all.find((x) => x.who === l.p[0] && x.cat === "rolled");
      ins.push({
        key,
        icon: "hourglass",
        tone: "var(--error-50)",
        toneFg: "var(--error-500)",
        title: "Hold new work for " + l.p[0],
        body:
          "“" + t.task + "” is " + t.note.toLowerCase() +
          ". Similar deliverables slipped 2.4 days on average over the last 8 weeks.",
        factors: ["On-time " + l.p[2] + "% · 8 weeks", "Avg " + l.p[4] + " revision rounds", "Load " + round(l.pct) + "%"],
        action: "Show delayed",
        act: { type: "filterCat", cat: "rolled" },
      });
    });
  loads
    .filter((l) => l.pot > 0 && l.pct < 60 && !moved.has(l.p[0]))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 1)
    .forEach((l) => {
      const key = "un" + l.p[0];
      if (dismissed[key]) return;
      ins.push({
        key,
        icon: "user-plus",
        tone: "var(--success-100)",
        toneFg: "var(--success-500)",
        title: l.p[0] + " can take more " + l.p[1] + " work",
        body:
          fmtH(l.pot - l.a) + " free " + periodWord + ". At past pace that is about " +
          Math.max(1, Math.floor((l.pot - l.a) / 2.5)) + " more deliverables of average size.",
        factors: ["Qty vs potential " + round(l.pct) + "%", "On-time " + l.p[2] + "%", "Client feedback " + l.p[3] + "/5"],
        action: "",
        act: null,
      });
    });
  if (
    names.has("Aniket Bangal") &&
    !dismissed.cfAniket &&
    all.some((t) => t.who === "Aniket Bangal" && /revision 5/.test(t.task))
  ) {
    ins.push({
      key: "cfAniket",
      icon: "message",
      tone: "var(--warning-100)",
      toneFg: "var(--warning-500)",
      title: "Add a reviewer to the WhatsApp creative",
      body: "This is round 5 for ICICI Prudential; the client averages 2.1 rounds. A senior review before sending usually closes it in one more round.",
      factors: ["Client feedback 3.8/5", "Round 5 vs avg 2.1", "Historical delivery data"],
      action: "",
      act: null,
    });
  }

  // ---- task list ----
  const rank = (t) => P_ORDER.indexOf(t.cat === "rolled" ? "reprio" : t.cat);
  const listed = (cat === "all" ? all : all.filter((t) => t.cat === cat))
    .slice()
    .sort((a, b) => rank(b) - rank(a) || a.who.localeCompare(b.who));
  const stLbl = {
    done: ["Done", "var(--success-100)", "rgb(0,91,75)"],
    wip: ["In progress", "var(--info-100)", "rgb(30,64,175)"],
    todo: ["To do", "var(--neutral-100)", "var(--neutral-700)"],
  };
  const clock = (x) => Math.floor(x) + ":" + String(round((x % 1) * 60)).padStart(2, "0");
  const list = listed.map((t) => {
    const k = P_CATS[t.cat];
    const s = stLbl[t.status];
    const when = week
      ? t.d0 === t.d1
        ? P_DAYS[t.d0]
        : P_DAYS[t.d0] + " – " + P_DAYS[t.d1]
      : clock(t.sh) + " – " + clock(Math.min(18, t.sh + todayH(t)));
    return {
      id: t.id,
      task: t.task,
      proj: t.proj,
      who: t.who,
      ini: initials(t.who),
      tag: t.cat === "new" ? tileLbl.new : k[0],
      tagBg: k[1],
      tagFg: k[2],
      note: t.note,
      when,
      hrs: fmtH(hrs(t)),
      st: s[0],
      stBg: s[1],
      stFg: s[2],
    };
  });

  return {
    week,
    tiles,
    ticks,
    rows,
    nowLeft: pos(P_NOW) + "%",
    todayLeft: pos(P_TODAY) + "%",
    todayW: pos(P_TODAY + 1) - pos(P_TODAY) + "%",
    legend: [
      ...P_ORDER.map((k) => ({ label: k === "new" ? "Assigned" : P_CATS[k][0], bg: P_CATS[k][1], ring: P_CATS[k][3] })),
      { label: "Done", bg: "var(--success-100)", ring: "inset 0 0 0 1px rgb(110,231,183)" },
    ],
    team: {
      exp: tExp + "%",
      load: tP ? round((tA / tP) * 100) + "%" : "–",
      assigned: fmtH(tA),
      potential: fmtH(tP),
    },
    eff,
    insights: ins.slice(0, 4),
    insightCount: ins.length,
    list,
    listTitle:
      (cat === "all" ? "All tasks" : cat === "new" ? tileLbl.new : P_CATS[cat][0]) + " · " + list.length,
    periodLabel: ctx
      ? week
        ? ctx.week_label
        : ctx.today_label
      : week
        ? "Mon 5 – Fri 9 Oct"
        : "Thursday, 8 Oct",
  };
}
