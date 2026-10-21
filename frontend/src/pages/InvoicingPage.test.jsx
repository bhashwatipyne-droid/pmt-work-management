import { act } from "react";
import { createRoot } from "react-dom/client";
import InvoicingPage from "@/pages/InvoicingPage";

jest.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
jest.mock("@/services/api", () => ({
  getInvoiceProjects: (tab) =>
    Promise.resolve({
      counts: { ready: 2, raised: 1 },
      projects:
        tab === "ready"
          ? [
              { id: "p1", name: "ICICI Contra", client: "ICICI", code: "IC-01", status_changed_at: "2026-10-10T10:00:00Z", counts: { Content: 3, Design: 2, Animation: 1 }, poc: "Asha Rao", minutes: 380, waiting_days: 6 },
              { id: "p2", name: "Zed Launch", client: "Zed", code: "ZL-02", status_changed_at: "2026-10-01T10:00:00Z", counts: { Content: 1, Design: 0, Animation: 0 }, poc: "", minutes: 60, waiting_days: 15 },
            ]
          : [{ id: "p3", name: "Old Job", client: "Acme", code: "AC-03", status_changed_at: "2026-09-01T10:00:00Z", invoice_raised_at: "2026-09-05T10:00:00Z", counts: { Content: 1, Design: 1, Animation: 0 }, poc: "Ben Lee", minutes: 120, waiting_days: 0 }],
    }),
  getInvoiceProject: () =>
    Promise.resolve({
      id: "p1", name: "ICICI Contra", client: "ICICI", code: "IC-01", poc: "Asha Rao", status: "Ready for Invoice",
      status_changed_at: "2026-10-10T10:00:00Z", waiting_days: 6,
      lines: [
        { id: "l1", category: "Content", name: "Carousel A", type: "Carousel", qty: 2, minutes: 90, duration_seconds: 0, link: "https://x.test/a", made_by: "Ben Lee", made_by_role: "member" },
        { id: "l2", category: "Design", name: "Poster B", type: "Poster", qty: 1, minutes: 45, duration_seconds: 0, link: "", made_by: "Cara Ng", made_by_role: "member" },
        { id: "l3", category: "Animation", name: "Reel C", type: "Reel", qty: 1, minutes: 120, duration_seconds: 30, link: "https://x.test/c", made_by: "Ben Lee", made_by_role: "member" },
      ],
    }),
  getOptions: () => Promise.resolve({ deliverable_types: ["Carousel", "Poster", "Reel"] }),
  editInvoiceLine: () => Promise.resolve(),
  raiseInvoice: () => Promise.resolve(),
  undoRaiseInvoice: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

test("invoicing page: list tabs, search and detail", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<InvoicingPage />); });
  await wait(50);
  const dump = [host.innerHTML];
  expect(host.textContent).toContain("ICICI Contra");

  const tabs = Array.from(host.querySelectorAll("button"));
  const raisedTab = tabs.find((b) => /raised/i.test(b.textContent));
  await act(async () => raisedTab.click());
  await wait(50);
  dump.push(host.innerHTML);
  const readyTab = Array.from(host.querySelectorAll("button")).find((b) => /ready/i.test(b.textContent));
  await act(async () => readyTab.click());
  await wait(20);

  const row = Array.from(host.querySelectorAll("*")).find((n) => n.children.length === 0 && n.textContent.trim() === "ICICI Contra");
  await act(async () => row.click());
  await wait(60);
  dump.push(host.innerHTML);
  expect(host.textContent).toContain("Ben Lee");

  await act(async () => root.unmount());
  host.remove();
});
