import { act } from "react";
import { createRoot } from "react-dom/client";

import HeldTasksPanel from "./HeldTasksPanel";

jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUser: { id: "u1", role: "admin" } }) }));
jest.mock("@/services/api", () => ({ getProjects: jest.fn(), getDeliverables: jest.fn() }));
jest.mock("@/services/planningApi", () => ({
  getReviewQueue: jest.fn(),
  resolveReviewItem: jest.fn(),
  rejectReviewItem: jest.fn(),
}));

const api = require("@/services/planningApi");
const base = require("@/services/api");

// CRA resets mock implementations between tests, so they are set here.
beforeEach(() => {
  base.getProjects.mockResolvedValue([{ id: "p1", name: "BNP Balanced Hybrid NFO Shoot Video" }, { id: "p2", name: "Other" }]);
  base.getDeliverables.mockResolvedValue([{ id: "d1", name: "Fund Animation" }]);
  api.getReviewQueue.mockResolvedValue([
    { id: "t1", raw_line: "BBNPP > Balanced Hybrid Fund Animation", assignee_name: "Tejas", team: "animation", work_date: "2026-10-28", project_id: "p1", review_reasons: ["Client was guessed, please confirm"] },
  ]);
  api.resolveReviewItem.mockResolvedValue({});
  api.rejectReviewItem.mockResolvedValue({});
});

// Radix popovers are very slow under jsdom; swap in a plain open/close wrapper
// (same as ProjectPicker.test.jsx). What is under test is the panel, not Radix.
jest.mock("@/components/ui/popover", () => {
  const React = require("react");
  const Ctx = React.createContext({});
  return {
    Popover: ({ open, onOpenChange, children }) => React.createElement(Ctx.Provider, { value: { open, onOpenChange } }, children),
    PopoverTrigger: ({ children }) => {
      const { open, onOpenChange } = React.useContext(Ctx);
      return React.cloneElement(children, { onClick: () => onOpenChange(!open) });
    },
    PopoverContent: React.forwardRef(({ children }, ref) => {
      const { open } = React.useContext(Ctx);
      return open ? React.createElement("div", { ref }, children) : null;
    }),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
Element.prototype.scrollIntoView = () => {};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<HeldTasksPanel />));
  await flush();
  await flush();
  return host;
}

const click = (el) => act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
const byText = (host, text) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

test("shows a held line with its guessed project and confirms it", async () => {
  const host = await mount();
  // the project list is not fetched until the panel is opened
  expect(base.getProjects).not.toHaveBeenCalled();
  await act(async () => {
    const d = host.querySelector("details");
    d.open = true;
    d.dispatchEvent(new Event("toggle"));
  });
  await flush();
  await flush();
  expect(base.getProjects).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain("BBNPP > Balanced Hybrid Fund Animation");
  expect(host.textContent).toContain("Client was guessed, please confirm");
  expect(host.querySelector('button[aria-label="Project"]').textContent).toContain("BNP Balanced Hybrid NFO Shoot Video");
  await click(host.querySelector('button[aria-label="Deliverable"]'));
  await flush();
  const option = [...document.querySelectorAll('[role="option"]')].find((o) => o.textContent.includes("Fund Animation"));
  await click(option);
  expect(host.querySelector('button[aria-label="Deliverable"]').textContent).toContain("Fund Animation");
  await click(byText(host, "Confirm and send"));
  await flush();
  expect(api.resolveReviewItem).toHaveBeenCalledWith("t1", { project_id: "p1", deliverable_id: "d1" });
  expect(host.querySelector('[data-testid="held-tasks"]')).toBeNull();
});

test("Reject removes the line", async () => {
  const host = await mount();
  await click(byText(host, "Reject"));
  await flush();
  expect(api.rejectReviewItem).toHaveBeenCalledWith("t1");
  expect(host.querySelector('[data-testid="held-tasks"]')).toBeNull();
});
