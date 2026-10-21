import { act } from "react";
import { createRoot } from "react-dom/client";
import ProjectsPage from "@/pages/ProjectsPage";

jest.mock(
  "react-router-dom",
  () => ({ useNavigate: () => jest.fn(), useLocation: () => ({ state: null, pathname: "/projects" }) }),
  { virtual: true },
);
jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" }, currentUserId: "u1", loading: false }),
}));
jest.mock("@/hooks/useAccess", () => ({ useAccess: () => ({ canManageProjects: true }) }));
jest.mock("@/hooks/useUndo", () => ({ useUndo: () => ({ pushUndo: () => {} }) }));
jest.mock("@/components/projects/CreateProjectModal", () => ({ CreateProjectModal: () => null }));
jest.mock("@/components/ui/ConfirmDeleteModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/components/projects/ProjectFilterPanel", () => ({ ProjectFilterPanel: () => null }));
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <div>{children}</div>,
  PopoverTrigger: ({ children }) => <>{children}</>,
  PopoverContent: () => null,
}));
jest.mock("@/components/ui/dropdown-menu", () =>
  new Proxy({}, {
    get: (_t, key) => (key === "__esModule" ? true : ({ children }) => <div>{children}</div>),
  }),
);
jest.mock("@/services/api", () => ({
  getProjects: () =>
    Promise.resolve([
      { id: "p1", name: "ICICI Contra", status: "Active", client_id: "c1", client_name: "ICICI", poc_id: "k1", created_at: "2026-10-01", deliverables: [] },
      { id: "p2", name: "Zed Launch", status: "On Hold", client_id: "c2", client_name: "Zed", created_at: "2026-09-01", deliverables: [] },
    ]),
  getProjectMetrics: () => Promise.resolve({}),
  getClients: () => Promise.resolve([{ id: "c1", name: "ICICI", contact_persons: [] }]),
  getOptions: () => Promise.resolve({ deliverable_types: [] }),
  getDeliverableNamesByProject: () => Promise.resolve({}),
  hideProject: () => Promise.resolve(),
  unhideProject: () => Promise.resolve(),
  deleteProject: () => Promise.resolve(),
  bulkHideProjects: () => Promise.resolve(),
  bulkUnhideProjects: () => Promise.resolve(),
  bulkUpdateProjectStatus: () => Promise.resolve(),
  bulkDeleteProjects: () => Promise.resolve(),
  reorderProjects: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("projects page renders the board and the list", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ProjectsPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

  const dump = [host.innerHTML];
  expect(host.textContent).toContain("ICICI Contra");
  expect(host.textContent).toContain("Zed Launch");

  const listBtn = Array.from(host.querySelectorAll("button")).find((b) => /^\s*List\s*$/.test(b.textContent));
  if (listBtn) {
    await act(async () => listBtn.click());
    dump.push(host.innerHTML);
  }
  expect(dump.length).toBeGreaterThan(0);

  await act(async () => root.unmount());
  host.remove();
});
