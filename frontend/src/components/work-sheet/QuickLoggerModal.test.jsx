import { act } from "react";
import { createRoot } from "react-dom/client";
import QuickLoggerModal from "@/components/work-sheet/QuickLoggerModal";

jest.mock("@/analytics", () => ({ trackEvent: jest.fn() }), { virtual: false });
jest.mock("../../analytics", () => ({ trackEvent: () => {} }));
jest.mock("@/services/api", () => ({ getTimeDefaults: () => Promise.resolve({ defaults: { Carousel: 40, Poster: 30 } }) }));
jest.mock("@/lib/appActions", () => ({ clearQuickLogPreset: () => {}, peekQuickLogPreset: () => null }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

const props = {
  open: true,
  currentUser: { id: "u1", department: "Design" },
  clients: [{ id: "c1", name: "ICICI" }, { id: "c2", name: "Zed" }],
  projects: [
    { id: "p1", name: "Contra Fund", client_id: "c1", description: "Contra campaign" },
    { id: "p2", name: "Contra Fund II", client_id: "c1" },
    { id: "p3", name: "Launch", client_id: "c2" },
  ],
  deliverables: [
    { id: "d1", name: "Carousel A", project_id: "p1" },
    { id: "d2", name: "Poster B", project_id: "p1" },
  ],
  options: { deliverable_types: ["Carousel", "Poster", "Reel"], deliverable_type_categories: { Carousel: "Design" } },
};

const setText = async (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(10);
};
const click = async (host, re) => {
  const el = Array.from(host.querySelectorAll("button")).find((b) => re.test(b.textContent));
  await act(async () => el.click());
  await wait(10);
};

test("quick logger walks through steps, adds and saves", async () => {
  const onSave = jest.fn(() => Promise.resolve());
  const onClose = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<QuickLoggerModal {...props} onSave={onSave} onClose={onClose} />); });
  await wait(30);
  const dump = [host.innerHTML];
  const input = () => host.querySelector('input[aria-label="Quick work entry"]');

  await setText(input(), "ICICI / Con");
  dump.push(host.innerHTML);
  await setText(input(), "ICICI / Contra Fund / ");
  dump.push(host.innerHTML);
  await setText(input(), "ICICI / Contra Fund / Carousel A / Carousel / ");
  dump.push(host.innerHTML);
  await setText(input(), "ICICI / Contra Fund / Carousel A / Carousel / 45m");
  dump.push(host.innerHTML);
  await click(host, /\+ Remark/);
  await click(host, /Add entry/);
  dump.push(host.innerHTML);
  await setText(input(), "ICICI / Contra Fund / Poster B / Reel / ");
  dump.push(host.innerHTML);
  await setText(input(), "");
  await click(host, /^Save/);
  expect(onSave).toHaveBeenCalled();
  dump.push(JSON.stringify(onSave.mock.calls[0][0]));

  await act(async () => root.unmount());
  host.remove();
});
