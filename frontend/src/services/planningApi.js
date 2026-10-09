// Data layer for Planning and Task cards, backed by /api/planning/* (backend/planning.py).
// Invoicing is the other real module: services/api.js.
//
// The screens only talk to this file. The names and shapes below are the ones the
// screens were built against, so nothing else had to change when the sample data
// was swapped for the API:
//
//   Planning   getPlanTasks, reassignTask, dismissInsight, resetInsights
//   Task cards listAssignedTasks, acceptTask, declineTask, askAboutTask
//
// Where the data comes from: WhatsApp tasklists are matched to a project and
// deliverable by the listener, stored in `tasklist_items`, and served here.
// Accepting a card creates the row in that member's Work Sheet on the server.
import { useEffect, useSyncExternalStore } from "react";
import axios from "axios";
import { toast } from "sonner";

import { API } from "@/services/api";
import { P_PEOPLE } from "@/lib/planning/seed";

const POLL_MS = 60 * 1000;
// The efficiency numbers (on-time %, feedback, revisions) have no data source yet.
// People without a seed entry get neutral values that do not trigger any
// "hold new work" style suggestion.
const NEUTRAL_STATS = [80, 4.0, 2.0, []];

const listeners = new Set();

let state = {
  tasks: [],
  notes: [],
  people: [],
  peopleById: [],
  ctx: null,
  dismissed: {},
  loaded: { plan: false, cards: false },
};

const setState = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const errorText = (err, fallback) => {
  const detail = err?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail.message === "string") return detail.message;
  return fallback;
};

// ---------------- loading ----------------

export const toPeopleRows = (people) =>
  (people || []).map((p) => {
    const seed = P_PEOPLE.find((s) => s[0] === p.name);
    const [onTime, feedback, revisions, leave] = seed ? seed.slice(2) : NEUTRAL_STATS;
    return [p.name, p.dept, onTime, feedback, revisions, leave];
  });

let failing = { plan: false, cards: false };

const fail = (scope, err, what) => {
  if (!failing[scope]) toast.error(errorText(err, `Could not load ${what}`));
  failing = { ...failing, [scope]: true };
};

export const refreshPlan = async () => {
  try {
    const { data } = await axios.get(`${API}/planning/overview`);
    failing = { ...failing, plan: false };
    setState({
      tasks: data.tasks || [],
      people: toPeopleRows(data.people),
      peopleById: data.people || [],
      ctx: data.ctx || null,
      loaded: { ...state.loaded, plan: true },
    });
  } catch (err) {
    fail("plan", err, "the plan");
  }
};

export const refreshCards = async () => {
  try {
    const { data } = await axios.get(`${API}/planning/my-tasks`);
    failing = { ...failing, cards: false };
    setState({ notes: data || [], loaded: { ...state.loaded, cards: true } });
  } catch (err) {
    // 403 just means this user has no cards (e.g. admin / HR); stay quiet.
    if (err?.response?.status !== 403) fail("cards", err, "your assigned tasks");
  }
};

const REFRESH = { plan: refreshPlan, cards: refreshCards };
const watchers = { plan: 0, cards: 0 };
let timer = null;

const tick = () => {
  Object.keys(watchers).forEach((scope) => {
    if (watchers[scope] > 0) REFRESH[scope]();
  });
};

const startWatching = (scope) => {
  watchers[scope] += 1;
  REFRESH[scope]();
  if (!timer) {
    timer = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
  }
  return () => {
    watchers[scope] -= 1;
    if (Object.values(watchers).every((n) => n <= 0) && timer) {
      clearInterval(timer);
      window.removeEventListener("focus", tick);
      timer = null;
    }
  };
};

// scope: "plan" (Planning page) or "cards" (task cards). It starts loading and
// keeps the data fresh (every minute and when the tab regains focus) while the
// component is mounted.
export const usePlanningStore = (scope) => {
  useEffect(() => (scope ? startWatching(scope) : undefined), [scope]);
  return useSyncExternalStore(subscribe, () => state);
};

// ---------------- Planning ----------------

export const getPlanTasks = async () => {
  await refreshPlan();
  return state.tasks;
};

// to / from are names (what the suggestion card knows); the API wants the user id.
export const reassignTask = async (taskId, to) => {
  const target = (state.peopleById || []).find((p) => p.name === to);
  if (!target) {
    toast.error("Could not find " + to + " in the team");
    return false;
  }
  try {
    await axios.post(`${API}/planning/tasks/${taskId}/reassign`, { to_user_id: target.id });
    await refreshPlan();
    return true;
  } catch (err) {
    toast.error(errorText(err, "Could not reassign the task"));
    refreshPlan();
    return false;
  }
};

export const dismissInsight = (key) => setState({ dismissed: { ...state.dismissed, [key]: true } });

export const resetInsights = () => setState({ dismissed: {} });

// ---------------- Task cards ----------------

export const listAssignedTasks = async () => {
  await refreshCards();
  return state.notes;
};

const removeNote = (id) => setState({ notes: state.notes.filter((n) => n.id !== id) });

// Each of these returns true when the server took the action, false otherwise
// (after showing its own error), so the card only celebrates real successes.
export const acceptTask = async (id) => {
  try {
    await axios.post(`${API}/planning/my-tasks/${id}/accept`, {});
    removeNote(id);
    return true;
  } catch (err) {
    toast.error(errorText(err, "Could not accept the task"));
    refreshCards();
    return false;
  }
};

export const declineTask = async (id, reason, message) => {
  try {
    await axios.post(`${API}/planning/my-tasks/${id}/decline`, { reason, message: message || "" });
    removeNote(id);
    return true;
  } catch (err) {
    toast.error(errorText(err, "Could not decline the task"));
    refreshCards();
    return false;
  }
};

// The task stays in the person's queue after a question.
export const askAboutTask = async (id, message) => {
  try {
    await axios.post(`${API}/planning/my-tasks/${id}/ask`, { message });
    return true;
  } catch (err) {
    toast.error(errorText(err, "Could not send the question"));
    return false;
  }
};
