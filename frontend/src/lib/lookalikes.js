// Spotting clients and projects whose names are easy to confuse.
//
// People log time against the wrong project when two names differ by a year,
// a language or one word ("Contra Fund" vs "Contra Fund – Anniversary"), and
// they add duplicate clients when the same company is typed two ways
// ("Aditya Birla Sun Life MF" vs "ABSL"). Everything here is plain string
// matching, cheap enough to run while someone types.

// Projects that are finished with: delivered (Completed, and the two invoice
// steps that follow it) or Scrapped. No new work is logged against these, so
// the Work Sheet and Quick Log pickers leave them out. Matches the statuses
// the overdue-timeline job in backend/server.py already treats as closed.
export const CLOSED_PROJECT_STATUSES = [
  "Completed",
  "Ready for Invoice",
  "Raised Invoice",
  "Scrapped",
];

export const isProjectClosed = (project) =>
  CLOSED_PROJECT_STATUSES.includes(project?.status);

// Words that say what kind of company it is rather than which one.
const CLIENT_FILLER = [
  "mutual", "fund", "funds", "mf", "amc", "asset", "assets", "management",
  "managers", "investment", "investments", "ltd", "limited", "pvt", "private",
  "india", "co", "company", "the", "and",
];

// Words that say nothing about which project it is.
const PROJECT_FILLER = ["the", "and", "for", "of", "a", "an", "to", "new", "project", "campaign"];

export const clientWords = (name) =>
  String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !CLIENT_FILLER.includes(w));

// Edit distance between two short strings.
export const editDistance = (a, b) => {
  const m = a.length;
  const n = b.length;
  if (!m || !n) return Math.max(m, n);
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
};

// Same word, a prefix of it, or a small typo.
const wordsNear = (w, x) => {
  if (w === x) return true;
  if (w.length >= 3 && x.startsWith(w)) return true;
  if (x.length >= 3 && w.startsWith(x)) return true;
  const len = Math.min(w.length, x.length);
  if (len < 4) return false;
  const limit = len >= 7 ? 2 : 1;
  return editDistance(w, x) <= limit || editDistance(w, x.slice(0, w.length)) <= limit;
};

const initialCase = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Existing clients that look like `query`, best first (at most 4). `exact`
// means it is the same client, not just a similar name.
export function findSimilarClients(query, clients = []) {
  const raw = String(query || "").trim().toLowerCase();
  if (raw.length < 2) return [];
  const qWords = clientWords(query);
  const q = qWords.join("");
  const out = [];

  clients.forEach((client) => {
    const cWords = clientWords(client.name);
    const c = cWords.join("");
    const initials = cWords.map((w) => w[0]).join("");
    let score = 0;
    let why = "";

    if (String(client.name || "").trim().toLowerCase() === raw) {
      score = 100;
      why = "Same name";
    } else if (q && q === c) {
      score = 95;
      why = "Same name once words like “Mutual Fund”, “MF” or “AMC” are ignored";
    } else if (q.length >= 2 && q === initials) {
      score = 85;
      why = `Matches the initials ${initials.toUpperCase()}`;
    } else {
      const ratio = 1 - editDistance(q, c) / Math.max(q.length, c.length, 1);
      const shared = qWords.filter((w) => w.length >= 2 && cWords.some((x) => wordsNear(w, x)));
      const prefix = q.length >= 4 ? 1 - editDistance(q, c.slice(0, q.length)) / q.length : 0;
      if ((ratio >= 0.78 || prefix >= 0.8) && q.length >= 4) {
        score = Math.round(60 + Math.max(ratio, prefix) * 20);
        why = "Very similar spelling";
      } else if (shared.length && shared.length >= Math.ceil(qWords.length / 2)) {
        score = 55 + shared.length * 5;
        why =
          (shared.length > 1 ? "Shares the words " : "Shares the word ") +
          shared.map((w) => `“${initialCase(w)}”`).join(", ");
      } else if (q.length >= 3 && c.includes(q)) {
        score = 50;
        why = `Name contains “${String(query).trim()}”`;
      }
    }

    if (score) out.push({ client, score, why, exact: score >= 85 });
  });

  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

// The part of an email after the @, lower-cased. "" when there isn't one.
export const emailDomain = (email) =>
  (String(email || "").split("@")[1] || "").trim().toLowerCase();

// The client's own name as it shows up in project names: its words, and its
// initials, which are how prefixes like "ABSL_" or "FT_" usually get written.
const clientTokens = (clientName) => {
  const words = clientWords(clientName);
  const tokens = new Set(words);
  if (words.length > 1) tokens.add(words.map((w) => w[0]).join(""));
  return tokens;
};

// Words in a project name that could tell it apart: the client's own name
// and filler words are dropped, and plurals folded ("Leaflets" = "Leaflet").
export const projectWords = (name, clientName = "") => {
  const drop = clientTokens(clientName);
  return String(name || "")
    .toLowerCase()
    .replace(/[_\-–·]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .split(/\s+/)
    .filter((w) => w && !PROJECT_FILLER.includes(w) && !drop.has(w))
    .map((w) => w.replace(/s$/, ""));
};

// Existing projects that look like `name`, best first (at most 4). Projects
// for `clientId` rank above other clients'; `exact` is the same name for the
// same client.
export function findSimilarProjects(name, clientId, projects = [], clientNameOf = () => "") {
  const raw = String(name || "").trim().toLowerCase();
  if (raw.length < 3) return [];
  const qWords = projectWords(name, clientNameOf(clientId));
  const q = qWords.join(" ");
  const out = [];

  projects.forEach((project) => {
    const same = !!clientId && project.client_id === clientId;
    const pWords = projectWords(project.name, clientNameOf(project.client_id));
    const p = pWords.join(" ");
    let score = 0;
    let why = "";

    if (String(project.name || "").trim().toLowerCase() === raw) {
      score = 100;
      why = "Same name";
    } else if (q && q === p) {
      score = 92;
      why = "Same name once the client prefix and filler words are ignored";
    } else {
      const shared = qWords.filter((w) => w.length >= 3 && pWords.some((x) => wordsNear(w, x)));
      const ratio = 1 - editDistance(q, p) / Math.max(q.length, p.length, 1);
      if (ratio >= 0.8 && q.length >= 5) {
        score = 80;
        why = "Very similar spelling";
      } else if (shared.length >= 2 || (shared.length === 1 && Math.min(qWords.length, pWords.length) === 1)) {
        score = 50 + shared.length * 8;
        why = "Shares " + shared.map((w) => `“${w}”`).join(", ");
      }
    }

    if (!score) return;
    if (same) score += 10;
    else if (clientId) score -= 25;
    if (score >= 30) out.push({ project, score, why, same, exact: same && score >= 100 });
  });

  return out.sort((a, b) => b.score - a.score).slice(0, 4);
}

// The projects in `projects` that `project` is easy to confuse with: a
// look-alike name for the same client, or the identical name at another
// client (a merely similar name at another client is rarely picked by
// mistake).
export function findLookalikes(project, projects = [], clientNameOf = () => "") {
  if (!project) return [];
  const others = projects.filter((p) => p.id !== project.id);
  const twins = findSimilarProjects(
    project.name,
    project.client_id,
    others.filter((p) => p.client_id === project.client_id),
    clientNameOf
  ).map((m) => m.project);
  const name = String(project.name || "").trim().toLowerCase();
  others.forEach((p) => {
    if (String(p.name || "").trim().toLowerCase() === name && !twins.includes(p)) twins.push(p);
  });
  return twins;
}

// projectId -> findLookalikes(project) for every project in `projects`.
// Grouping by client keeps this cheap for a thousand projects.
export function buildLookalikeIndex(projects = [], clientNameOf = () => "") {
  const index = new Map();
  const byClient = new Map();
  const byName = new Map();

  projects.forEach((p) => {
    if (!byClient.has(p.client_id)) byClient.set(p.client_id, []);
    byClient.get(p.client_id).push(p);
    const key = String(p.name || "").trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  });

  projects.forEach((p) => {
    const siblings = (byClient.get(p.client_id) || []).filter((x) => x.id !== p.id);
    const twins = findSimilarProjects(p.name, p.client_id, siblings, clientNameOf).map((m) => m.project);
    (byName.get(String(p.name || "").trim().toLowerCase()) || []).forEach((x) => {
      if (x.id !== p.id && !twins.includes(x)) twins.push(x);
    });
    if (twins.length) index.set(p.id, twins);
  });

  return index;
}

// The project's name split into words, with `bold` on the ones its
// look-alikes don't share: what actually tells it apart.
export function distinguishingParts(project, twins = [], clientNameOf = () => "") {
  const name = String(project?.name || "");
  if (!twins.length) return [{ text: name, bold: false }];
  const twinWords = new Set(twins.flatMap((t) => projectWords(t.name, clientNameOf(t.client_id))));
  const ownClient = clientTokens(clientNameOf(project.client_id));
  return name.split(/(\s+|_|–|-)/).map((w) => {
    const norm = w.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/s$/, "");
    return {
      text: w,
      bold: !!norm && norm.length > 1 && !twinWords.has(norm) && !ownClient.has(norm) && !PROJECT_FILLER.includes(norm),
    };
  });
}
