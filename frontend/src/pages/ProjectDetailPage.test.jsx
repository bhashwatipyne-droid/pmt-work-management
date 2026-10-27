import { act } from "react";
import { createRoot } from "react-dom/client";
import ProjectDetailPage from "@/pages/ProjectDetailPage";

jest.mock(
  "react-router-dom",
  () => ({ useParams: () => ({ projectId: "p1" }), useNavigate: () => jest.fn() }),
  { virtual: true },
);
jest.mock("@/components/projects/DeliverableModal", () => ({ DeliverableModal: () => null }));
jest.mock("@/components/projects/ImportDeliverablesModal", () => ({ ImportDeliverablesModal: () => null }));
jest.mock("@/components/projects/ProjectEditModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/projects/ShareProjectModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/ui/ConfirmDeleteModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/work-sheet/QuickLogTrigger", () => ({ QuickLogTrigger: () => null }));
jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/lib/exportCsv", () => ({
  ...jest.requireActual("@/lib/exportCsv"),
  downloadCsv: jest.fn(),
  todayStamp: () => "2026-10-27",
}));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({
    currentUser: { id: "u1", role: "admin", name: "Asha" },
    currentUserId: "u1",
    users: [{ id: "u1", name: "Asha" }],
    loading: false,
  }),
}));
jest.mock("@/hooks/useAccess", () => ({
  useAccess: () => ({ canManageProjects: true, canLogWork: true }),
}));
jest.mock("@/services/api", () => ({
  getProject: () =>
    Promise.resolve({
      id: "p1",
      name: "ICICI Contra",
      status: "Active",
      deliverables: [
        { id: "d1", name: "Carousel", current_stage: "Design", stage_status: "In Progress", required_stages: ["Content", "Design"] },
        { id: "d2", name: "Reel", current_stage: "Content", stage_status: "Closed", required_stages: ["Content"] },
      ],
    }),
  getProjectWorkLog: () => Promise.resolve({ items: [], total: 0, total_minutes: 0 }),
  getOptions: () => Promise.resolve({ deliverable_types: [] }),
  getClients: () => Promise.resolve([]),
  getWorksheetLookups: () => Promise.resolve({ clients: [], projects: [], deliverables: [] }),
  updateProject: () => Promise.resolve(),
  deleteProject: () => Promise.resolve(),
  updateDeliverable: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("project page shows header, progress, and the deliverables list", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ProjectDetailPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  expect(host.textContent).toContain("ICICI Contra");
  expect(host.querySelector('[data-testid="project-detail-stats"]')).not.toBeNull();
  expect(host.textContent).toContain("1 of 2 deliverables done");
  expect(Array.from(host.querySelectorAll("input")).some((i) => i.value === "Carousel")).toBe(true);

  await act(async () => root.unmount());
  host.remove();
});

test("Export downloads the listed deliverables as a CSV", async () => {
  const { downloadCsv } = require("@/lib/exportCsv");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ProjectDetailPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const btn = host.querySelector('[data-testid="project-detail-export-deliverables-btn"]');
  expect(btn).not.toBeNull();
  await act(async () => {
    btn.click();
  });

  expect(downloadCsv).toHaveBeenCalledTimes(1);
  const [filename, header, rows] = downloadCsv.mock.calls[0];
  expect(filename).toBe("icici-contra-deliverables-2026-10-27.csv");
  expect(header[0]).toBe("Deliverable");
  expect(rows).toHaveLength(2);
  const reel = rows.find((r) => r[0] === "Reel");
  expect(reel[4]).toBe("Done");
  const carousel = rows.find((r) => r[0] === "Carousel");
  expect(carousel[3]).toBe("Content > Design");

  await act(async () => root.unmount());
  host.remove();
});
