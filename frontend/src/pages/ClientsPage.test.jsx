import { act } from "react";
import { createRoot } from "react-dom/client";
import ClientsPage from "@/pages/ClientsPage";

jest.mock(
  "react-router-dom",
  () => ({ useLocation: () => ({ state: null, pathname: "/clients" }), useNavigate: () => jest.fn() }),
  { virtual: true },
);
jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" }, currentUserId: "u1", loading: false }),
}));
jest.mock("@/components/clients/AddClientModal", () => ({ AddClientModal: () => null }));
jest.mock("@/components/ui/ConfirmDeleteModal", () => ({ __esModule: true, default: () => null }));
jest.mock("@/services/api", () => ({
  getClients: () =>
    Promise.resolve([
      {
        id: "c1", name: "ICICI", status: "Active",
        contact_persons: [{ id: "k1", name: "Ravi", designation: "CFO", email: "r@x.com", phone: "9876543210" }],
      },
      { id: "c2", name: "Zed Corp", status: "Inactive", contact_persons: [] },
    ]),
  getProjects: () => Promise.resolve([{ id: "p1", client_id: "c1", name: "Contra", status: "Active" }]),
  deleteClient: () => Promise.resolve(),
  createClient: () => Promise.resolve(),
  updateClient: () => Promise.resolve(),
  createClientContact: () => Promise.resolve(),
  updateClientContact: () => Promise.resolve(),
  deleteClientContact: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("clients list renders and the edit dialog opens with the client's contacts", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ClientsPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });

  const dump = [host.innerHTML];
  expect(host.textContent).toContain("ICICI");
  expect(host.textContent).toContain("Zed Corp");

  const edit = host.querySelector('[title="Edit client"]');
  await act(async () => edit.click());
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  dump.push(document.body.innerHTML);
  expect(document.body.textContent).toContain("Edit Client");
  expect(document.body.textContent).toContain("Ravi");

  await act(async () => root.unmount());
  host.remove();
});
