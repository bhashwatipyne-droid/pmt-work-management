import { act } from "react";
import { createRoot } from "react-dom/client";

import LearnedRulesPanel from "./LearnedRulesPanel";

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));
jest.mock("@/services/planningApi", () => ({ getLearnedRules: jest.fn(), setLearnedRuleDisabled: jest.fn() }));

const api = require("@/services/planningApi");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => {
  api.getLearnedRules.mockResolvedValue([
    { id: "alias:tfp", kind: "alias", example: "tfp", client_name: "Thefinpedia", count: 4, disabled: false },
    { id: "exact:x", kind: "exact", example: "Foo > Bar", project_name: "Proj", count: 1, disabled: false },
  ]);
  api.setLearnedRuleDisabled.mockResolvedValue({});
});

test("lists what was learned and turns a rule off", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<LearnedRulesPanel />));
  await flush();
  expect(host.textContent).toContain("Lines starting with “tfp” go to Thefinpedia (seen in 4 lines)");
  expect(host.textContent).toContain("2 active · 2 total");
  const off = [...host.querySelectorAll("button")].find((b) => b.textContent === "Turn off");
  await act(async () => off.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
  expect(api.setLearnedRuleDisabled).toHaveBeenCalledWith("alias:tfp", true);
  expect(host.textContent).toContain("1 active · 2 total");
});

test("renders nothing before anything is learned", async () => {
  api.getLearnedRules.mockResolvedValue([]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(<LearnedRulesPanel />));
  await flush();
  expect(host.innerHTML).toBe("");
});
