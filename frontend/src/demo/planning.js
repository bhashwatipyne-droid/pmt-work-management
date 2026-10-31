// Planning (the WhatsApp task board) is not part of the public demo: it needs a
// live task feed. The Work Sheet still polls for "assigned to me" cards, so
// those routes answer with an empty list instead of an error.

export const handlePlanning = ({ method, path }) => {
  if (!path.startsWith("/planning")) return undefined;
  if (method === "GET") {
    if (path === "/planning/overview") return { ctx: {}, tasks: [], people: [] };
    if (path === "/planning/deliverable-types") return [];
    return [];
  }
  return { ok: true };
};
