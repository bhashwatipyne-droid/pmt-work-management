// Data layer for Planning, Task cards and Invoicing.
//
// There is no backend for these yet, so everything here runs against sample data
// held in memory (lib/planning/seed.js) and resets on reload. When the endpoints
// exist, keep the names and shapes below and swap each function body for an
// axios call (see services/api.js for the pattern); the screens only talk to this
// file, so nothing else has to change.
//
//   Planning   getPlanTasks, reassignTask
//   Task cards listAssignedTasks, acceptTask, declineTask, askAboutTask
//   Invoicing  listInvoiceProjects, editInvoiceLine, markInvoiceRaised, undoInvoiceRaised
import { useSyncExternalStore } from "react";

import { INV, NOTES, P_TASKS } from "@/lib/planning/seed";
import { taskFromRow } from "@/lib/planning/planningLogic";

const listeners = new Set();

let state = {
  tasks: P_TASKS.map(taskFromRow),
  notes: NOTES,
  dismissed: {},
  invRaised: {}, // projectId -> "8 Oct"
  invEdit: {}, // projectId -> { lineIndex: { name, type, qty, dur, link } }
};

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const usePlanningStore = () => useSyncExternalStore(subscribe, () => state);

const resolve = (value) => Promise.resolve(value);

// ---------------- Planning ----------------

export const getPlanTasks = () => resolve(state.tasks);

export const reassignTask = (taskId, to, from) => {
  setState({
    tasks: state.tasks.map((t) =>
      t.id === taskId ? { ...t, who: to, note: "Reassigned from " + String(from).split(" ")[0] } : t
    ),
  });
  return resolve(true);
};

export const dismissInsight = (key) => setState({ dismissed: { ...state.dismissed, [key]: true } });

export const resetInsights = () => setState({ dismissed: {} });

// ---------------- Task cards ----------------

export const listAssignedTasks = () => resolve(state.notes);

const removeNote = (id) => setState({ notes: state.notes.filter((n) => n.id !== id) });

export const acceptTask = (id) => {
  removeNote(id);
  return resolve(true);
};

export const declineTask = (id) => {
  removeNote(id);
  return resolve(true);
};

// The task stays in the person's queue after a question.
export const askAboutTask = () => resolve(true);

// ---------------- Invoicing ----------------

export const listInvoiceProjects = () => resolve(INV);

export const editInvoiceLine = (projectId, index, patch) => {
  const byProject = state.invEdit[projectId] || {};
  setState({
    invEdit: {
      ...state.invEdit,
      [projectId]: { ...byProject, [index]: { ...(byProject[index] || {}), ...patch } },
    },
  });
  return resolve(true);
};

export const markInvoiceRaised = (projectId, on) => {
  setState({ invRaised: { ...state.invRaised, [projectId]: on } });
  return resolve(true);
};

export const undoInvoiceRaised = (projectId) => {
  const next = { ...state.invRaised };
  delete next[projectId];
  setState({ invRaised: next });
  return resolve(true);
};
