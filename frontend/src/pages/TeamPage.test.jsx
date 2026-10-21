import { act } from "react";
import { createRoot } from "react-dom/client";
import TeamPage from "@/pages/TeamPage";

jest.mock(
  "react-router-dom",
  () => ({
    useNavigate: () => () => {},
    useLocation: () => ({ pathname: "/team", state: null, key: "k" }),
  }),
  { virtual: true },
);
jest.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
jest.mock("@/context/UserContext", () => ({
  useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" }, currentUserId: "u1", loading: false }),
}));
jest.mock("@/services/api", () => ({
  getUsers: () =>
    Promise.resolve([
      { id: "u1", name: "Asha", username: "asha", email: "a@x.com", department: "Design", role: "admin", active: true },
      { id: "u2", name: "Ben Lee", username: "ben", email: "ben@x.com", department: "Content", role: "member", active: true },
      { id: "u3", name: "Cara Ng", username: "cara", email: "cara@x.com", department: "Design", role: "manager", active: false },
    ]),
  getOptions: () => Promise.resolve({ departments: ["Design", "Content"], roles: ["member", "manager"] }),
  createUser: () => Promise.resolve({}),
  updateUser: () => Promise.resolve({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("team page renders roster and both modals", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<TeamPage />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  const dump = [host.innerHTML];
  expect(host.textContent).toContain("Ben Lee");
  expect(host.textContent).not.toContain("Asha");

  const edit = Array.from(host.querySelectorAll("button")).find((b) => b.textContent.trim() === "Edit");
  await act(async () => edit.click());
  dump.push(document.body.innerHTML);
  const cancel = Array.from(document.querySelectorAll("button")).find((b) => /cancel/i.test(b.textContent));
  if (cancel) await act(async () => cancel.click());

  const add = host.querySelector("button[data-testid]");
  await act(async () => add.click());
  dump.push(document.body.innerHTML);

  await act(async () => root.unmount());
  host.remove();
});
