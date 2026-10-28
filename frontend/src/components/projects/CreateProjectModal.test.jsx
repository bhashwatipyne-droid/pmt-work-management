import { act } from "react";
import { createRoot } from "react-dom/client";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

jest.mock("react-router-dom", () => ({ useNavigate: () => () => {} }), { virtual: true });
jest.mock("@/components/ui/DatePill", () => ({ DatePill: () => null }));
jest.mock("sonner", () => ({ toast: { error: () => {}, success: () => {} } }));
jest.mock("../../analytics", () => ({ trackEvent: () => {} }));
jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUserId: "u1" }) }));
jest.mock("@/components/clients/AddClientModal", () => ({ AddClientModal: () => null }));
jest.mock("@/services/api", () => ({
  checkProjectDuplicates: () => Promise.resolve({ duplicates: [] }),
  createProject: (uid, payload) => Promise.resolve({ id: "np", name: payload.name, status: payload.status, __payload: payload }),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const setVal = async (el, value) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(10);
};
const clickBtn = async (host, re) => {
  const el = Array.from(host.querySelectorAll("button")).find((b) => re.test(b.textContent));
  await act(async () => el.click());
  await wait(10);
};

const clients = [
  { id: "c1", name: "ICICI Prudential", contact_persons: [{ id: "k1", name: "Asha Rao" }, { id: "k2", name: "Ben Lee" }] },
  { id: "c2", name: "Zed Capital", contact_persons: [] },
];
const projects = [
  { id: "p1", name: "Contra Fund", client_id: "c1", code: "IC-1", status: "Active", end_date: "2026-12-01", description: "Contra campaign" },
  { id: "p2", name: "Contra Fund", client_id: "c2", code: "ZC-1", status: "Active" },
];

test("create project modal: client, name checks, deliverable, submit", async () => {
  const onCreated = jest.fn();
  const onClose = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<CreateProjectModal open onClose={onClose} onCreated={onCreated} clients={clients} projects={projects} onClientsChanged={() => {}} deliverableTypes={["Carousel", "Poster"]} />);
  });
  await wait(30);
  const dump = [host.innerHTML];

  await setVal(host.querySelector('input[aria-label="Search client"]'), "ici");
  dump.push(host.innerHTML);
  await clickBtn(host, /ICICI Prudential/);
  dump.push(host.innerHTML);

  const nameInput = () => host.querySelector('input[aria-label="Project name"]');
  await setVal(nameInput(), "Contra Fund");
  dump.push(host.innerHTML);
  await setVal(nameInput(), "Contra Fund 2");
  dump.push(host.innerHTML);
  await setVal(nameInput(), "Brand New Thing");
  await setVal(host.querySelector('input[aria-label="Project description"]'), "Oct edition");
  dump.push(host.innerHTML);

  await clickBtn(host, /Add deliverable/);
  dump.push(host.innerHTML);
  const nameField = host.querySelector('input[type="text"]:not([aria-label])') || host.querySelectorAll("input")[host.querySelectorAll("input").length - 1];
  void nameField;
  await clickBtn(host, /^(Cancel|Discard)/);
  dump.push(host.innerHTML);

  const dates = host.querySelectorAll('input[type="date"]');
  await setVal(dates[0], "2026-11-01");
  await setVal(dates[1], "2026-11-30");
  const submit = host.querySelector('[data-testid]:last-of-type');
  void submit;
  await clickBtn(host, /Create project/);
  await wait(30);
  expect(onCreated).toHaveBeenCalled();
  dump.push(JSON.stringify(onCreated.mock.calls[0][0].__payload));

  await act(async () => root.unmount());
  host.remove();
});
