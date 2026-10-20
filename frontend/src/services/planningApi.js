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

// New WhatsApp tasklists should show up within a minute. Polling only runs
// while the tab is visible (see tick). The task cards are polled by every
// signed-in person all day, so they get the slower interval; the Planning page
// is only open for managers who are looking at it.
const TICK_MS = 10 * 1000;
const SCOPE_MS = { plan: 20 * 1000, cards: 30 * 1000 };

const listeners = new Set();

let state = {
  tasks: [],
  notes: [],
  people: [],
  peopleById: [],
  ctx: null,
  planLoading: false,
  planDate: "", // "" = today; otherwise YYYY-MM-DD of the day being looked at
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

// [name, dept, (unused), (unused), (unused), leave days]
export const toPeopleRows = (people) =>
  (people || []).map((p) => [p.name, p.dept, null, null, null, []]);

let failing = { plan: false, cards: false };

const fail = (scope, err, what) => {
  if (!failing[scope]) toast.error(errorText(err, `Could not load ${what}`));
  failing = { ...failing, [scope]: true };
};

// Days already fetched, so going back to one shows it at once while a fresh
// copy loads behind it.
const planCache = new Map();

export const refreshPlan = async () => {
  try {
    const asked = state.planDate;
    const { data } = await axios.get(`${API}/planning/overview`, {
      params: asked ? { date: asked } : {},
    });
    const view = {
      tasks: data.tasks || [],
      people: toPeopleRows(data.people),
      peopleById: data.people || [],
      ctx: data.ctx || null,
    };
    planCache.set(asked, view);
    // A slower answer for a day the person has already moved off must not
    // overwrite the day they are looking at now.
    if (asked !== state.planDate) return;
    failing = { ...failing, plan: false };
    setState({ ...view, planLoading: false, loaded: { ...state.loaded, plan: true } });
  } catch (err) {
    setState({ planLoading: false });
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

const lastRun = { plan: 0, cards: 0 };

const runScope = (scope) => {
  lastRun[scope] = Date.now();
  REFRESH[scope]();
};

// force: the person just came back to the tab, so catch up straight away.
const tick = (force) => {
  if (document.hidden) return;
  const now = Date.now();
  Object.keys(watchers).forEach((scope) => {
    if (watchers[scope] > 0 && (force === true || now - lastRun[scope] >= SCOPE_MS[scope])) {
      runScope(scope);
    }
  });
};

const catchUp = () => tick(true);

const startWatching = (scope) => {
  watchers[scope] += 1;
  runScope(scope);
  if (!timer) {
    timer = setInterval(tick, TICK_MS);
    window.addEventListener("focus", catchUp);
    document.addEventListener("visibilitychange", catchUp);
  }
  return () => {
    watchers[scope] -= 1;
    if (Object.values(watchers).every((n) => n <= 0) && timer) {
      clearInterval(timer);
      window.removeEventListener("focus", catchUp);
      document.removeEventListener("visibilitychange", catchUp);
      timer = null;
    }
  };
};

// scope: "plan" (Planning page) or "cards" (task cards). It starts loading and
// keeps the data fresh (every 10 seconds while visible, and when the tab regains focus) while the
// component is mounted.
export const usePlanningStore = (scope) => {
  useEffect(() => (scope ? startWatching(scope) : undefined), [scope]);
  return useSyncExternalStore(subscribe, () => state);
};

// ---------------- Planning ----------------

// Look at the plan for another day ("" goes back to today).
export const setPlanDate = (day) => {
  const key = day || "";
  const cached = planCache.get(key);
  // Cached: show it now. Otherwise keep the old view, marked as loading, until
  // the new day arrives.
  setState({ planDate: key, ...(cached ? { ...cached, planLoading: false } : { planLoading: true }) });
  return refreshPlan();
};

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
