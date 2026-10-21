export const THREE_TEAMS = ["Content", "Design", "Animation"];
export const NONE = "__none__";

// Columns, widths and frozen offsets as in the redesign's Management sheet.
// Columns, widths and frozen offsets as in the redesign's Management sheet.
export const COLS = [
  { key: "date", label: "Date", w: 150, kind: "date" },
  { key: "task", label: "Task / activity", w: 300, kind: "text", long: 30 },
  { key: "type", label: "Task type", w: 160, kind: "select", filter: "type" },
  { key: "client", label: "Client", w: 150, kind: "select", filter: "client" },
  { key: "owner", label: "Stakeholder", w: 150, kind: "people", filter: "owner" },
  { key: "followup", label: "Follow-up with", w: 190, kind: "followup", filter: "with" },
  { key: "contact", label: "Client contact", w: 130, kind: "text" },
  { key: "count", label: "Deliverables", w: 110, kind: "number" },
  { key: "ifu", label: "Internal FU", w: 150, kind: "date" },
  { key: "cfu", label: "Client FU", w: 150, kind: "date" },
  { key: "status", label: "Tracking status", w: 150, kind: "select", filter: "status" },
  { key: "meet", label: "Meeting", w: 110, kind: "text" },
  { key: "remark", label: "Remark", w: 280, kind: "text", long: 34 },
];
export const COL_BY_KEY = Object.fromEntries(COLS.map((c) => [c.key, c]));
// Only Shruti and Sakshi run the Projects team's follow-ups.
export const STAKEHOLDERS = ["shruti", "sakshi"];
// Same first name, but on the Content team - not a Management stakeholder.
export const NOT_STAKEHOLDERS = ["sakshi agrawal"];
export const isStakeholder = (u) => {
  const name = (u.name || "").trim().toLowerCase().replace(/\s+/g, " ");
  return STAKEHOLDERS.includes(name.split(" ")[0]) && !NOT_STAKEHOLDERS.includes(name);
};
export const TEXT_FIELD = { task: "task", contact: "spoc", meet: "meeting_time" };
export const DATE_FIELD = { ifu: "internal_follow_up_date", cfu: "client_follow_up_date", date: "start_date" };

// Fields the Filter menu (and the column menus) filter on.
export const FIELDS = [
  { key: "type", label: "Task type" },
  { key: "client", label: "Client" },
  { key: "owner", label: "Stakeholder" },
  { key: "status", label: "Tracking status" },
  { key: "with", label: "Follow-up with" },
  { key: "follow", label: "Follow-up" },
];

export const GROUPS = [
  ["owner", "Member"],
  ["client", "Client"],
  ["type", "Task type"],
  ["none", "None"],
];
