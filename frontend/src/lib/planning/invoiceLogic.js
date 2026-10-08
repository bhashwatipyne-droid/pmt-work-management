// Ready-to-invoice maths, ported from the design prototype (invVals). Pure, like
// planningLogic.js: sample projects + the finance person's edits in, rows out.
import { INV, INV_MAKERS, RATE_TYPES } from "./seed";
import { initials } from "./planningLogic";

export const INV_CATS = [
  { key: "Content", icon: "document", tint: "var(--brand-50)", fg: "var(--brand-700)", role: "Writer" },
  { key: "Design", icon: "palette", tint: "var(--success-100)", fg: "rgb(0,91,75)", role: "Designer" },
  { key: "Animation", icon: "film", tint: "var(--warning-100)", fg: "rgb(146,64,14)", role: "Animator" },
];

export const hm = (m) => {
  const total = Math.round(m);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  return (h ? h + "h" : "") + (h && mm ? " " : "") + (mm || !h ? mm + "m" : "");
};

export const typesFor = (cat) => [...new Set(RATE_TYPES.filter((r) => r.cat === cat).map((r) => r.type))];

// Lines of a project with the person's edits applied.
// [category, name, type, qty, minutes, durationSeconds, link, index]
export const linesOf = (project, edits = {}) =>
  project.items.map((i, ix) => {
    const e = (edits[project.id] || {})[ix] || {};
    return [
      i[0],
      e.name ?? i[1],
      e.type ?? i[2],
      e.qty ?? i[3],
      i[4],
      e.dur ?? i[5],
      e.link ?? "https://drive.thefinpedia.com/" + project.code.toLowerCase() + "/" + (ix + 1),
      ix,
    ];
  });

export const makerOf = (cat, index) => INV_MAKERS[cat][index % INV_MAKERS[cat].length];

export const categoriesOf = (project, edits) => {
  const all = linesOf(project, edits);
  return INV_CATS.map((c) => {
    const its = all.filter((i) => i[0] === c.key);
    return {
      ...c,
      its,
      qty: its.reduce((a, i) => a + i[3], 0),
      mins: its.reduce((a, i) => a + i[4], 0),
    };
  });
};

export const waitTone = (days, raised) =>
  raised
    ? { bg: "var(--neutral-100)", fg: "var(--neutral-500)" }
    : days > 20
      ? { bg: "var(--error-50)", fg: "rgb(153,27,27)" }
      : days > 10
        ? { bg: "var(--warning-100)", fg: "rgb(146,64,14)" }
        : { bg: "var(--neutral-100)", fg: "var(--neutral-700)" };

export function buildInvoiceList(projects, { raised = {}, edits = {}, tab = "ready", query = "" } = {}) {
  const q = query.trim().toLowerCase();
  const readyAll = projects.filter((p) => !raised[p.id]);
  const raisedAll = projects.filter((p) => raised[p.id]);
  const shown = (tab === "ready" ? readyAll : raisedAll).filter(
    (p) => !q || (p.name + " " + p.client + " " + p.code).toLowerCase().includes(q)
  );

  const totals = readyAll.map((p) => categoriesOf(p, edits));
  const pcs = (k) => totals.reduce((a, cats) => a + cats.find((x) => x.key === k).qty, 0);

  return {
    readyCount: readyAll.length,
    raisedCount: raisedAll.length,
    stats: {
      projects: String(readyAll.length),
      pieces: String(pcs("Content") + pcs("Design") + pcs("Animation")),
      piecesSub: pcs("Content") + " content · " + pcs("Design") + " design · " + pcs("Animation") + " animation",
      logged: hm(totals.reduce((a, cats) => a + cats.reduce((x, k) => x + k.mins, 0), 0)),
      oldest: readyAll.length ? Math.max(...readyAll.map((p) => p.wait)) + " days" : "–",
    },
    rows: shown.map((p) => {
      const cats = categoriesOf(p, edits);
      const n = (k) => cats.find((x) => x.key === k).qty;
      const tone = waitTone(p.wait, raised[p.id]);
      return {
        id: p.id,
        name: p.name,
        sub: p.client + " · " + p.code,
        client: p.client,
        code: p.code,
        done: p.done,
        c: n("Content"),
        d: n("Design"),
        a: n("Animation"),
        pocName: p.poc,
        pocIni: initials(p.poc),
        wait: raised[p.id] ? "Raised " + raised[p.id] : p.wait + " days",
        waitBg: tone.bg,
        waitFg: tone.fg,
        logged: hm(cats.reduce((a, k) => a + k.mins, 0)) + " logged",
      };
    }),
    emptyText:
      tab === "ready"
        ? q
          ? "No projects match your search."
          : "Nothing waiting. Every completed project has been invoiced."
        : "No invoices raised yet.",
  };
}

export const findInvoiceProject = (id) => INV.find((p) => p.id === id) || null;
