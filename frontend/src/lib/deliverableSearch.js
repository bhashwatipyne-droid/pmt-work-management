// Search across every project's deliverables from the Work Sheet's Deliverable
// dropdown. Typing "absl reels" finds every reel-like deliverable of ABSL
// projects, newest first.
//
//  - every word has to match, in any order (name, type, project, client);
//  - a trailing "s" is ignored, so "reels" finds "Reel" and "Reels";
//  - a client's initials count as a word, so "absl" finds Aditya Birla Sun Life.

const stem = (word) => (word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word);

export const searchWords = (text) =>
  String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

const initialsOf = (name) =>
  searchWords(name)
    .map((w) => w[0])
    .join("");

const timeOf = (deliverable) => {
  const t = Date.parse(deliverable?.created_at || deliverable?.updated_at || "");
  return Number.isNaN(t) ? 0 : t;
};

// matches: [{ deliverable, project, clientName }] -> the ones every typed word
// matches, newest deliverable first.
export function searchDeliverables(query, candidates, limit = 40) {
  const words = searchWords(query).map(stem);
  if (!words.length) return [];

  const found = [];
  for (const candidate of candidates) {
    const { deliverable, project, clientName } = candidate;
    const hay = [
      deliverable.name,
      deliverable.type,
      project?.name,
      project?.code,
      clientName,
      initialsOf(clientName),
      initialsOf(project?.name),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    // Each word may also match a word of the haystack with its "s" removed.
    const hayWords = searchWords(hay);
    const hit = (w) => hay.includes(w) || hayWords.some((h) => stem(h) === w);
    if (words.every(hit)) found.push(candidate);
  }

  found.sort((a, b) => timeOf(b.deliverable) - timeOf(a.deliverable));
  return found.slice(0, limit);
}
