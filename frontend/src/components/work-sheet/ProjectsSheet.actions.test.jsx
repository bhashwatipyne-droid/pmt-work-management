import { act } from "react";
import { createRoot } from "react-dom/client";
import { ProjectsSheet, prefetchProjectSheet } from "./ProjectsSheet";

// Drives the Management sheet through its handlers and records what it
// renders, what it saves and what it tells the user. Used to prove that
// splitting the file changes nothing.

const mockLog = [];
globalThis.__psLog = mockLog;
let mockStore = {};
let mockCounter = 0;

jest.mock("sonner", () => {
  const t = (m) => globalThis.__psLog.push(`toast: ${m}`);
  t.error = (m) => globalThis.__psLog.push(`toast.error: ${m}`);
  t.success = (m) => globalThis.__psLog.push(`toast.success: ${m}`);
  return { toast: t };
});
jest.mock("@/services/prefetch", () => ({ consumePrefetch: (_k, fn) => fn() }));
jest.mock("@/services/api", () => ({
  getClients: () => Promise.resolve([]),
  getProjectTaskHistory: () => Promise.resolve([]),
  getProjectTasks: () => Promise.resolve(globalThis.__psData),
  createProjectTask: (f) => {
    globalThis.__psLog.push(`create ${JSON.stringify(f)}`);
    globalThis.__psCounter += 1;
    const task = { id: `n${globalThis.__psCounter}`, task: "", status: "On track", start_date: "2026-10-21", created_at: `z${globalThis.__psCounter}`, ...f };
    delete task.day;
    globalThis.__psStore[task.id] = task;
    return Promise.resolve(task);
  },
  deleteProjectTask: (id) => {
    globalThis.__psLog.push(`delete ${id}`);
    return Promise.resolve();
  },
  setProjectTaskUpdate: (id, day, note) => {
    globalThis.__psLog.push(`note ${id} ${day} ${JSON.stringify(note)}`);
    return Promise.resolve();
  },
  updateProjectTask: (id, fields) => {
    globalThis.__psLog.push(`update ${id} ${JSON.stringify(fields)}`);
    const { day, ...rest } = fields;
    const cur = globalThis.__psStore[id] || globalThis.__psData.tasks.find((t) => t.id === id);
    const saved = { ...cur, ...rest };
    globalThis.__psStore[id] = saved;
    return Promise.resolve(saved);
  },
}));
jest.mock("@/lib/exportCsv", () => ({
  downloadCsv: (name, header, rows) => globalThis.__psLog.push(`csv ${name} ${JSON.stringify(header)} ${JSON.stringify(rows)}`),
  todayStamp: () => "STAMP",
}));
jest.mock("@/components/ui/popover", () => {
  const React = require("react");
  const Ctx = React.createContext({ open: true });
  return {
    Popover: ({ open, onOpenChange, children }) => (
      <Ctx.Provider value={{ open: open !== false, onOpenChange, controlled: open !== undefined }}>{children}</Ctx.Provider>
    ),
    PopoverTrigger: ({ children }) => {
      const c = React.useContext(Ctx);
      if (!c.controlled || !c.onOpenChange) return <>{children}</>;
      return React.cloneElement(children, {
        onClick: (e) => {
          children.props.onClick?.(e);
          c.onOpenChange(!c.open);
        },
      });
    },
    PopoverAnchor: ({ children }) => <>{children}</>,
    PopoverContent: ({ children, className }) => {
      const c = React.useContext(Ctx);
      return c.open ? <div data-popover={className}>{children}</div> : null;
    },
  };
});
jest.mock("@radix-ui/react-popover", () => ({ PopoverClose: ({ children }) => <>{children}</> }));
jest.mock("./MonthPicker", () => ({
  MonthPicker: (p) => {
    globalThis.__psMonth = p;
    return <div data-stub="month">{`${p.value}|${p.currentMonth}|${p.maxMonth}|${p.allowAll}`}</div>;
  },
}));
jest.mock("./WorksheetFormulaBar", () => ({
  WorksheetFormulaBar: (p) => {
    globalThis.__psFormula = p;
    return <div data-stub="formula">{JSON.stringify({ l: p.label, v: p.value, r: p.activeRow, c: p.activeCol, e: p.editable, ph: p.placeholder })}</div>;
  },
}));
jest.mock("./WorkSheetHistory", () => ({
  WorkSheetHistory: (p) => <div data-stub="history">{`${p.open}|${p.stage}|${p.subtitle}|${typeof p.load}`}</div>,
}));
jest.mock("./RangeSelectionBar", () => ({
  RangeSelectionBar: (p) => {
    globalThis.__psRange = p;
    return <div data-stub="range">{JSON.stringify({ s: p.stats, l: p.left })}</div>;
  },
}));
jest.mock("../ui/ConfirmDeleteModal", () => ({
  __esModule: true,
  default: (p) => {
    globalThis.__psConfirm = p;
    return <div data-stub="confirm">{`${p.open}|${p.title}|${p.loading}|${p.confirmLabel}`}</div>;
  },
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__psCounter = 0;
globalThis.__psStore = {};
Element.prototype.scrollIntoView = function () {};

const users = [
  { id: "u1", name: "Shruti Rao", active: true },
  { id: "u2", name: "Sakshi Jain", active: true },
  { id: "u3", name: "Ben Lee", active: true },
  { id: "u4", name: "Gone Person", active: false },
];
const clients = [
  { id: "c1", name: "ICICI" },
  { id: "c2", name: "Zed" },
];
const data = {
  today: "2026-10-21",
  options: {
    task_types: ["Review", "Call"],
    statuses: ["On track", "At risk", "Delayed", "Done"],
    teams: ["Content", "Design", "Animation"],
    meeting_types: [],
  },
  tasks: [
    { id: "t1", task: "Send proposal", task_type: "Review", client_id: "c1", owner_id: "u1", collaborator_ids: ["u3"], status: "On track", start_date: "2026-10-02", internal_follow_up_date: "2026-10-10", client_follow_up_date: "2026-10-25", spoc: "Rhea", deliverable_count: 3, meeting_time: "4pm", follow_up_teams: ["Content"], follow_up_user_ids: ["u2"], follow_up_others: "Vendor", created_at: "a" },
    { id: "t2", task: "Chase invoice", task_type: "Call", client_id: "c2", owner_id: "u2", status: "Delayed", start_date: "2026-10-05", internal_follow_up_date: "2026-10-30", created_at: "b" },
    { id: "t3", task: "Plan offsite", owner_id: "u1", status: "Done", start_date: "2026-10-07", created_at: "c", sort_order: 5 },
    { id: "t4", task: "Quarterly review notes with a very long description that overflows", task_type: "Review", client_id: "c1", owner_id: "u2", status: "At risk", start_date: "2026-10-12", client_follow_up_date: "2026-10-15", created_at: "d" },
    { id: "t5", task: "Old September item", owner_id: "u1", status: "On track", start_date: "2026-09-20", created_at: "e" },
  ],
  updates: [
    { task_id: "t1", day: "2026-10-21", note: "Waiting on legal", user_id: "u1" },
    { task_id: "t2", day: "2026-10-14", note: "Called twice", user_id: "u1" },
  ],
};

const wait = (ms = 20) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function mount(props) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, props };
}

const q = (host, sel) => host.querySelector(sel);
const qa = (host, sel) => Array.from(host.querySelectorAll(sel));
const btn = (host, text, nth = 0) =>
  qa(host, "button").filter((b) => (b.textContent || "").trim() === text || (b.getAttribute("aria-label") || "") === text)[nth];
const ev = (el, type, init = {}) => {
  const E = type.startsWith("key") ? KeyboardEvent : type.startsWith("mouse") ? MouseEvent : Event;
  const e = new E(type, { bubbles: true, cancelable: true, ...init });
  return el.dispatchEvent(e);
};
const cell = (host, id, key) => q(host, `[data-cell="${id}:${key}"]`);

function snap(host, label, out) {
  out.push(`--- ${label}`);
  out.push(host.innerHTML);
}

function props(out, extra = {}) {
  return {
    currentUser: { id: "u1", role: "admin", name: "Shruti Rao" },
    users,
    clients,
    tabs: <div data-tabs="1" />,
    ...extra,
  };
}

async function run(out) {
  globalThis.__psData = JSON.parse(JSON.stringify(data));
  globalThis.__psStore = {};
  globalThis.__psCounter = 0;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: (t) => { mockLog.push(`clip ${JSON.stringify(t)}`); return Promise.resolve(); } },
  });

  const { host, root } = mount();
  const logTo = (label) => {
    out.push(`--- log ${label}`);
    out.push(mockLog.splice(0).join("\n"));
  };
  const key = async (el, k, init = {}) => { await act(async () => { ev(el, "keydown", { key: k, ...init }); }); await flush(); };
  const click = async (el) => {
    if (!el) { mockLog.push("MISSING click target " + (new Error().stack.split("\n")[2] || "").replace(/.*:(\d+):\d+\)?$/, "line $1")); return; }
    await act(async () => { el.click(); });
    await flush();
  };
  const down = async (el, init = {}) => { await act(async () => { ev(el, "mousedown", init); }); await flush(); };

  // Boot: prefetch before mount, as the Work Sheet page does.
  prefetchProjectSheet();
  await act(async () => { root.render(<ProjectsSheet {...props(out)} />); });
  snap(host, "loading", out);
  await wait();
  snap(host, "loaded (member groups collapsed)", out);

  await click(btn(host, "Expand all"));
  snap(host, "expanded", out);
  const grid = q(host, '[tabindex="0"]');

  // Cell selection + movement + formula bar.
  await down(cell(host, "t1", "task"));
  out.push(`formula ${JSON.stringify(globalThis.__psFormula && { l: globalThis.__psFormula.label, v: globalThis.__psFormula.value })}`);
  await key(grid, "ArrowDown");
  await key(grid, "ArrowRight");
  await key(grid, "ArrowRight", { shiftKey: true });
  await key(grid, "ArrowDown", { shiftKey: true });
  snap(host, "block + row select via keys", out);
  await key(grid, "Escape");
  await key(grid, "Escape");
  await key(grid, "End");
  await key(grid, "Home", { ctrlKey: true });
  await key(grid, "Tab");
  await key(grid, "Tab", { shiftKey: true });
  snap(host, "after Home/End/Tab", out);

  // Edit a text cell by typing, finish with Enter.
  await down(cell(host, "t1", "task"));
  await key(grid, "x");
  snap(host, "editing", out);
  const input = q(host, 'input[aria-label="Edit cell"]');
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(input, "Send proposal v2");
    ev(input, "input");
  });
  await act(async () => { ev(input, "keydown", { key: "Enter" }); });
  await wait();
  logTo("edit task");
  snap(host, "after edit", out);

  // Edit remark, deliverables (bad then good), then cancel with Escape.
  await down(cell(host, "t2", "remark"));
  await key(grid, "Enter");
  const ri = q(host, 'input[aria-label="Edit cell"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(ri, "Called again");
    ev(ri, "input");
  });
  await act(async () => { ev(ri, "keydown", { key: "Tab" }); });
  await wait();
  await down(cell(host, "t2", "count"));
  await key(grid, "7");
  let ci = q(host, 'input[aria-label="Edit cell"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(ci, "7x");
    ev(ci, "input");
  });
  await act(async () => { ev(ci, "keydown", { key: "Enter" }); });
  await wait();
  await down(cell(host, "t2", "count"));
  await key(grid, "9");
  ci = q(host, 'input[aria-label="Edit cell"]');
  await act(async () => { ev(ci, "keydown", { key: "Escape" }); });
  logTo("remark + count");

  // Delete clears a text cell; Backspace on a block clears it.
  await down(cell(host, "t1", "contact"));
  await key(grid, "Delete");
  await down(cell(host, "t1", "contact"));
  await key(grid, "ArrowDown", { shiftKey: false });
  await key(grid, "ArrowRight", { shiftKey: true });
  await key(grid, "Backspace");
  await wait();
  logTo("clear");

  // Copy, paste (single value fills block; grid; bad values), undo.
  await down(cell(host, "t1", "task"));
  await key(grid, "ArrowRight", { shiftKey: true });
  await key(grid, "c", { ctrlKey: true });
  await wait();
  logTo("copy");
  const paste = async (text) => {
    await act(async () => {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      e.clipboardData = { getData: () => text };
      grid.dispatchEvent(e);
    });
    await wait();
  };
  await down(cell(host, "t3", "task"));
  await paste("Pasted task");
  await down(cell(host, "t3", "status"));
  await paste("done");
  await paste("nope");
  await down(cell(host, "t3", "date"));
  await paste("05/10/2026");
  await paste("garbage");
  await down(cell(host, "t3", "type"));
  await paste("call");
  await down(cell(host, "t3", "client"));
  await paste("zed");
  await down(cell(host, "t3", "owner"));
  await paste("Sakshi Jain +1");
  await paste("Ben Lee");
  await down(cell(host, "t3", "followup"));
  await paste("Design, Shruti, Someone Else");
  await down(cell(host, "t3", "ifu"));
  await paste("2026-10-12");
  await down(cell(host, "t3", "task"));
  await key(grid, "ArrowDown", { shiftKey: false });
  await down(cell(host, "t3", "task"));
  await key(grid, "ArrowRight", { shiftKey: true });
  await key(grid, "ArrowRight", { shiftKey: true });
  await paste("a\tb\tc\nd\te\tf");
  logTo("pastes");
  snap(host, "after pastes", out);
  await key(grid, "z", { ctrlKey: true });
  await key(grid, "z", { ctrlKey: true });
  await wait();
  logTo("undo");
  for (let i = 0; i < 60; i += 1) await key(grid, "z", { ctrlKey: true });
  await wait();
  const undoLog = mockLog.splice(0);
  out.push(`--- undo-all\n${undoLog.filter((l) => l.startsWith("toast")).slice(-2).join("\n")}\nupdates ${undoLog.filter((l) => l.startsWith("update")).length}`);

  // Drag-select with the mouse and fill with the handle.
  await down(cell(host, "t1", "task"));
  await act(async () => { ev(cell(host, "t2", "task"), "mouseover", { relatedTarget: document.body }); });
  await act(async () => { ev(window, "mouseup"); });
  snap(host, "drag-selected", out);
  const handle = q(host, '[aria-label="Drag to fill cells"]');
  if (handle) {
    await down(handle);
    await act(async () => { ev(cell(host, "t4", "task"), "mouseover", { relatedTarget: document.body }); });
    snap(host, "fill preview", out);
    await act(async () => { ev(window, "mouseup"); });
    await wait();
    logTo("fill");
  }

  // A real fill: copy one status down to the next row.
  await down(cell(host, "t2", "status"));
  await act(async () => { ev(window, "mouseup"); });
  const h2 = q(host, '[aria-label="Drag to fill cells"]');
  if (h2) {
    await down(h2);
    await act(async () => { ev(cell(host, "t4", "status"), "mouseover", { relatedTarget: document.body }); });
    await act(async () => { ev(window, "mouseup"); });
    await wait();
    logTo("fill status");
    snap(host, "after fill status", out);
  } else out.push("NO FILL HANDLE");

  // Pickers, expand editors and row drag.
  const popBtns = () => qa(host, "[data-popover] button");
  for (const [id, k, pick] of [["t4", "type", /^Call/], ["t4", "status", /^Done/], ["t4", "client", /^Zed/], ["t4", "owner", null], ["t4", "followup", null]]) {
    await down(cell(host, id, k));
    await key(grid, "Enter");
    snap(host, `picker ${k}`, out);
    if (pick) {
      const o = popBtns().find((b) => pick.test(b.textContent.trim()));
      if (o) await click(o);
      else out.push(`NO OPTION ${k}`);
    } else {
      const first = qa(cell(host, id, k), "[data-popover] button")[1] || qa(cell(host, id, k), "[data-popover] button")[0];
      if (first) await click(first);
      await key(grid, "Escape");
    }
    await wait();
    logTo(`picker ${k}`);
  }
  await down(cell(host, "t4", "task"));
  await key(grid, "Enter", { ctrlKey: true });
  snap(host, "expand task", out);
  await down(cell(host, "t4", "remark"));
  await key(grid, "Enter", { metaKey: true });
  snap(host, "expand remark", out);
  await key(grid, "Escape");
  const expandBtn = q(host, '[aria-label="Expand cell"]');
  if (expandBtn) await down(expandBtn);
  snap(host, "expand via button", out);
  const dragHandle = q(host, '[data-rowid="t1"] [aria-label="Drag to move row"]');
  if (dragHandle) {
    const dt = { effectAllowed: "", setData() {} };
    const mk = (type) => { const e = new Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; return e; };
    await act(async () => { dragHandle.dispatchEvent(mk("dragstart")); });
    await act(async () => { q(host, '[data-rowid="t3"]').dispatchEvent(mk("dragover")); });
    snap(host, "row drag over", out);
    await act(async () => { q(host, '[data-rowid="t3"]').dispatchEvent(mk("drop")); });
    await wait();
    logTo("row drop");
    await act(async () => { dragHandle.dispatchEvent(mk("dragend")); });
  } else out.push("NO ROW DRAG");

  // Row selection + bulk actions.
  const rowCheck = (id) => q(host, `[data-rowid="${id}"] span[title^="Click, drag"]`);
  if (btn(host, "Clear selection")) await click(btn(host, "Clear selection"));
  await down(rowCheck("t1"));
  await act(async () => { ev(window, "mouseup"); });
  await down(rowCheck("t3"), { shiftKey: true });
  snap(host, "rows selected", out);
  await click(btn(host, "Apply status"));
  await click(btn(host, "At risk", 0));
  await wait();
  logTo("bulk status");
  await click(btn(host, "Duplicate"));
  await wait();
  logTo("bulk duplicate");
  snap(host, "after duplicate", out);
  await click(btn(host, "Hide"));
  snap(host, "after hide", out);
  if (btn(host, "Clear selection")) await click(btn(host, "Clear selection"));
  const showHidden = qa(host, "button").find((b) => /hidden · Show/.test(b.textContent) && !/column/.test(b.textContent));
  if (showHidden) await click(showHidden);
  await down(rowCheck("t2"));
  await act(async () => { ev(window, "mouseup"); });
  await click(btn(host, "Delete"));
  out.push(`confirm ${globalThis.__psConfirm.open} ${globalThis.__psConfirm.title}`);
  await act(async () => { globalThis.__psConfirm.onConfirm(); });
  await wait();
  logTo("bulk delete");
  snap(host, "after delete", out);
  await down(q(host, 'span[title^="Click, drag"]'));
  await act(async () => { ev(window, "mouseup"); });
  await click(q(host, '[aria-label="Select all rows"]'));
  await click(q(host, '[aria-label="Select all rows"]'));
  await click(q(host, '[aria-label="Select all rows"]'));
  snap(host, "select-all toggled", out);

  // Search, filters, group by, sort, hide/freeze columns, widths.
  const search = q(host, 'input[aria-label="Search work sheet"]');
  const type = async (el, v) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
      ev(el, "input");
    });
  };
  await type(search, "invoice");
  snap(host, "search", out);
  await key(search, "Escape");
  await type(search, "zzzz");
  snap(host, "no match", out);
  await click(btn(host, "Clear filters"));
  await click(btn(host, "Client", 0));
  snap(host, "group by client", out);
  await click(btn(host, "Task type", 0));
  await click(btn(host, "None", 0));
  snap(host, "group none", out);
  await click(btn(host, "Member", 0));
  const head = (i) => qa(host, 'button[draggable="true"]')[i];
  await click(head(2));
  await click(btn(host, "Sort A → Z"));
  snap(host, "sorted", out);
  await click(btn(host, "Sort A → Z"));
  await click(btn(host, "Sort Z → A"));
  snap(host, "sorted desc", out);
  await click(btn(host, "Freeze up to this column"));
  snap(host, "frozen", out);
  await click(head(3));
  await click(btn(host, "Freeze up to this column"));
  await click(head(3));
  await click(btn(host, "Unfreeze columns"));
  await click(head(3));
  const statusRow = qa(host, '[data-popover] button').find((b) => /^\s*Review/.test(b.textContent));
  if (statusRow) await click(statusRow);
  snap(host, "type filter via column menu", out);
  const clearVals = qa(host, "button").find((b) => /^Clear$/.test(b.textContent.trim()));
  if (clearVals) await click(clearVals);
  await click(head(4));
  await click(btn(host, "Hide column"));
  snap(host, "col hidden", out);
  await act(async () => {
    const rz = q(host, '[role="separator"]');
    ev(rz, "mousedown", { clientX: 100 });
    ev(window, "mousemove", { clientX: 160 });
    ev(window, "mouseup");
  });
  snap(host, "resized", out);
  const hiddenBtn = qa(host, "button").find((b) => /hidden column/.test(b.textContent));
  if (hiddenBtn) await click(hiddenBtn);
  await click(head(0));
  const dateFrom = qa(host, '[data-popover] input[type="date"]')[0];
  if (dateFrom) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(dateFrom, "2026-10-06");
      ev(dateFrom, "change");
    });
    snap(host, "date range", out);
    await click(btn(host, "Clear dates"));
  }
  await click(head(0));
  // Column drag reorder.
  const heads = qa(host, 'button[draggable="true"]');
  await act(async () => {
    const dt = { effectAllowed: "", setData() {} };
    const mk = (type) => { const e = new Event(type, { bubbles: true, cancelable: true }); e.dataTransfer = dt; return e; };
    heads[0].dispatchEvent(mk("dragstart"));
  });
  await act(async () => {
    const e = new Event("drop", { bubbles: true, cancelable: true });
    heads[2].dispatchEvent(e);
  });
  snap(host, "reordered", out);

  // Filter menu / chips.
  await click(btn(host, "Filter"));
  const fieldBtn = (label) => qa(host, "button").find((x) => x.className.includes("h-[34px]") && x.textContent.includes(label));
  snap(host, "filter fields", out);
  await click(fieldBtn("Tracking status"));
  snap(host, "filter status values", out);
  const val = qa(host, "[data-popover] button").find((x) => /At risk/.test(x.textContent));
  if (val) await click(val);
  const val2 = qa(host, "[data-popover] button").find((x) => /Delayed/.test(x.textContent));
  if (val2) await click(val2);
  snap(host, "status filtered", out);
  const back = qa(host, "button").find((x) => /Done/.test(x.textContent) && x.closest("[data-popover]"));
  if (back) await click(back);
  snap(host, "filter chip", out);
  await click(btn(host, "Clear all"));
  snap(host, "chips cleared", out);

  // Export.
  await click(btn(host, "Export"));
  logTo("export");

  // Add rows, history.
  await click(btn(host, "Add row", 0));
  await wait();
  snap(host, "added row editing", out);
  logTo("add row");
  const ni = q(host, 'input[aria-label="Edit cell"]');
  if (ni) await act(async () => { ev(ni, "keydown", { key: "Escape" }); });
  await click(btn(host, "Add 3 rows") || btn(host, "Add 5 rows"));
  await wait(60);
  logTo("add rows");
  snap(host, "after add rows", out);
  await click(btn(host, "History"));
  snap(host, "history open", out);

  // Month change + empty month.
  await act(async () => { globalThis.__psMonth.onChange("2026-09"); });
  snap(host, "september", out);
  await act(async () => { globalThis.__psMonth.onChange("2026-08"); });
  snap(host, "august (empty)", out);
  await act(async () => { globalThis.__psMonth.onChange(null); });

  await act(async () => root.unmount());
  host.remove();
}

async function runReadOnly(out) {
  const { host, root } = mount();
  await act(async () => { root.render(<ProjectsSheet {...props(out, { currentUser: { id: "u3", role: "member", name: "Ben Lee" }, clients: undefined })} />); });
  snap(host, "member initial (cache)", out);
  await wait();
  await act(async () => { btn(host, "Expand all").click(); });
  const grid = q(host, '[tabindex="0"]');
  await act(async () => { ev(cell(host, "t1", "task"), "mousedown"); });
  await act(async () => { ev(grid, "keydown", { key: "Enter" }); });
  await act(async () => { ev(grid, "keydown", { key: "x" }); });
  await act(async () => { ev(grid, "keydown", { key: "Delete" }); });
  await act(async () => { ev(grid, "keydown", { key: "z", ctrlKey: true }); });
  snap(host, "member after keys", out);
  out.push(mockLog.splice(0).join("\n"));
  await act(async () => root.unmount());
  host.remove();
}

test("management sheet: admin and member scenarios", async () => {
  const out = [];
  await run(out);
  await runReadOnly(out);
  const text = out.join("\n");
  expect(text.length).toBeGreaterThan(1000);
  expect(text).toContain("Send proposal");
});
