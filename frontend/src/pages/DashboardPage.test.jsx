import { act } from "react";
import { createRoot } from "react-dom/client";
import DashboardPage from "@/pages/DashboardPage";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn() }),
  { virtual: true },
);
jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({
    currentUser: { id: "u1", role: "admin", name: "Asha" },
    users: [{ id: "u1", name: "Asha" }],
    loading: false,
  }),
}));
jest.mock("@/services/prefetch", () => ({
  consumePrefetch: (_k, fetcher) => fetcher(),
}));
jest.mock("@/components/work-sheet/MonthPicker", () => ({ MonthPicker: () => null }));
jest.mock("@/services/api", () => ({
  getDashboardHome: () =>
    Promise.resolve({
      today: "2026-10-21",
      projects: { p1: { id: "p1", name: "ICICI Contra", client_id: "c1", client_name: "ICICI", status: "Active" } },
      deliverables: [
        { id: "d1", project_id: "p1", name: "Carousel", stage: "Design", status: "In Progress", owner_id: "u1", due: "2026-10-20" },
      ],
      trend: [{ month: "2026-09" }, { month: "2026-10" }],
      monthly: [
        { month: "2026-09", active: 10, on_track: 6, delayed: 3, due_soon: 1 },
        { month: "2026-10", active: 12, on_track: 8, delayed: 3, due_soon: 1 },
      ],
      members: { tracked: [], stale: [] },
    }),
  getEfficiencyOverview: () => Promise.resolve({ employees: [] }),
  getEfficiencyTrend: () => Promise.resolve([]),
  getTeamActivity: () => Promise.resolve({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("home dashboard renders every tab", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<DashboardPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const dump = [];
  expect(host.querySelector('[data-testid="dashboard-page"]')).not.toBeNull();
  const tabButtons = Array.from(host.querySelectorAll('[role="tab"], button')).filter((b) =>
    /Overview|Actions|Delivery|Trends|Team/i.test(b.textContent),
  );
  dump.push(host.innerHTML);
  for (const b of tabButtons.slice(0, 8)) {
    await act(async () => b.click());
    dump.push(host.innerHTML);
  }
  expect(dump.length).toBeGreaterThan(2);
  expect(dump[0]).toContain("At a glance · last 12 months");

  await act(async () => root.unmount());
  host.remove();
});
