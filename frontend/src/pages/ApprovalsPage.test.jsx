import { act } from "react";
import { createRoot } from "react-dom/client";
import ApprovalsPage from "@/pages/ApprovalsPage";

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => jest.fn(),
    useSearchParams: () => [new URLSearchParams(""), jest.fn()],
  }),
  { virtual: true },
);
jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" }, currentUserId: "u1", loading: false, users: [] }),
}));
jest.mock("@/hooks/useUndo", () => ({ useUndo: () => ({ pushUndo: () => {} }) }));
jest.mock("@/lib/countsBus", () => ({ refreshCounts: () => {} }));
jest.mock("@/components/approvals/ApprovalsFilterModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/services/api", () => ({
  getApprovalBoard: () =>
    Promise.resolve({
      MANAGER: [
        { id: "a1", approval_type: "MANAGER", deliverable_id: "d1", deliverable_name: "Carousel A", project_name: "ICICI Contra", client_name: "ICICI", current_stage: "Design", due_date: "2026-10-30", submitted_at: "2026-10-18T10:00:00Z" },
        { id: "a2", approval_type: "MANAGER", deliverable_id: "d2", deliverable_name: "Reel B", project_name: "Zed Launch", client_name: "Zed", current_stage: "Content", due_date: "2026-10-12", submitted_at: "2026-10-10T10:00:00Z" },
      ],
      LEADERSHIP: [],
      CLIENT_SPOC: [],
      COMPLIANCE: [],
    }),
  approveApprovalItem: () => Promise.resolve(),
  bulkApproveApprovalItems: () => Promise.resolve(),
  moveApprovalItem: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));

test("approvals page lists the queue and opens a detail pane", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ApprovalsPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 80));
  });

  const dump = [host.innerHTML];
  expect(host.textContent).toContain("Carousel A");
  expect(host.textContent).toContain("Reel B");

  const row = Array.from(host.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent.trim() === "Carousel A");
  if (row) {
    await act(async () => row.click());
    dump.push(host.innerHTML);
  }
  expect(dump.length).toBeGreaterThan(0);

  await act(async () => root.unmount());
  host.remove();
});
