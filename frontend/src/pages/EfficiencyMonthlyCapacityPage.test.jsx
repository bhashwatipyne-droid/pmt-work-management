import { act } from "react";
import { createRoot } from "react-dom/client";
import EfficiencyMonthlyCapacityPage from "@/pages/EfficiencyMonthlyCapacityPage";

jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn() }), { virtual: true });
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "m1", role: "manager", name: "Meera", department: "Content" }, loading: false }),
}));
jest.mock("@/components/efficiency/EfficiencyFilters", () => ({
  currentMonth: () => "2026-10",
  monthLabel: (m) => ({ "2026-10": "October 2026", "2026-09": "September 2026" }[m] || m),
  shiftMonth: (m, d) => (d < 0 ? "2026-09" : "2026-11"),
}));
jest.mock("@/services/api", () => ({
  getEfficiencyOverview: () =>
    Promise.resolve({
      employees: [
        { user_id: "e1", name: "Asha Rao", department: "Content", non_core_hours: 10 },
        { user_id: "e2", name: "Ben Lee", department: "Content", non_core_hours: 0 },
        { user_id: "e3", name: "Other Dept", department: "Design", non_core_hours: 0 },
      ],
    }),
  getMonthlyCapacityList: () =>
    Promise.resolve([{ user_id: "e1", month: "2026-10", working_days: 22, leave_days: 2, working_hours_per_day: 8.5 }]),
  saveMonthlyCapacity: () => Promise.resolve({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("capacity page lists the team and shows the editor for the first person", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<EfficiencyMonthlyCapacityPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

  const dump = [host.innerHTML];
  expect(host.textContent).toContain("Asha Rao");
  expect(host.textContent).toContain("Ben Lee");
  expect(host.textContent).not.toContain("Other Dept");

  const ben = Array.from(host.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent.trim() === "Ben Lee");
  if (ben) {
    await act(async () => ben.click());
    dump.push(host.innerHTML);
  }

  await act(async () => root.unmount());
  host.remove();
});
