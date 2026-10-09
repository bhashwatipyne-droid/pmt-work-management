import axios from "axios";
import { toast } from "sonner";

import { acceptTask, askAboutTask, declineTask, refreshCards, refreshPlan, reassignTask } from "./planningApi";
import { showTaskCards } from "@/lib/planning/featureFlags";

jest.mock("axios", () => {
  const m = { get: jest.fn(), post: jest.fn(), defaults: { headers: { common: {} } } };
  return { __esModule: true, default: m, ...m };
});
jest.mock("sonner", () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));

const failure = (status, detail) => Object.assign(new Error("x"), { response: { status, data: { detail } } });

beforeEach(() => {
  axios.get.mockReset();
  axios.post.mockReset();
  toast.error.mockReset();
});

test("accept returns true on success and false (with the server's reason) on failure", async () => {
  axios.post.mockResolvedValueOnce({ data: {} });
  expect(await acceptTask("t1")).toBe(true);
  expect(axios.post.mock.calls[0][0]).toMatch(/\/api\/planning\/my-tasks\/t1\/accept$/);

  axios.post.mockRejectedValueOnce(failure(409, "Project is no longer available"));
  axios.get.mockResolvedValue({ data: [] });
  expect(await acceptTask("t2")).toBe(false);
  expect(toast.error).toHaveBeenCalledWith("Project is no longer available");
});

test("decline and ask send the payloads the API expects", async () => {
  axios.post.mockResolvedValue({ data: {} });
  expect(await declineTask("t1", "Workload is full", "")).toBe(true);
  expect(axios.post).toHaveBeenLastCalledWith(expect.stringMatching(/t1\/decline$/), { reason: "Workload is full", message: "" });
  expect(await askAboutTask("t1", "Hindi too?")).toBe(true);
  expect(axios.post).toHaveBeenLastCalledWith(expect.stringMatching(/t1\/ask$/), { message: "Hindi too?" });

  axios.post.mockRejectedValueOnce(failure(500));
  expect(await askAboutTask("t1", "again")).toBe(false);
});

test("cards load, and a 403 (admin / HR) is silent", async () => {
  axios.get.mockResolvedValueOnce({ data: [{ id: "t1", task: "A" }] });
  await refreshCards();
  axios.get.mockRejectedValueOnce(failure(403, "no"));
  await refreshCards();
  expect(toast.error).not.toHaveBeenCalled();
});

test("reassign resolves the person's id from the loaded plan", async () => {
  axios.get.mockResolvedValue({
    data: { ctx: { today: 0 }, tasks: [], people: [{ id: "u9", name: "Milind Tandi", dept: "Content" }] },
  });
  await refreshPlan();
  axios.post.mockResolvedValueOnce({ data: {} });
  expect(await reassignTask("t1", "Milind Tandi", "Ratnesh Bor")).toBe(true);
  expect(axios.post).toHaveBeenCalledWith(expect.stringMatching(/tasks\/t1\/reassign$/), { to_user_id: "u9" });

  expect(await reassignTask("t1", "Nobody", "Ratnesh Bor")).toBe(false);
});

test("task cards are for members and managers only", () => {
  expect(showTaskCards({ role: "member" })).toBe(true);
  expect(showTaskCards({ role: "manager" })).toBe(true);
  expect(showTaskCards({ role: "admin" })).toBe(false);
  expect(showTaskCards({ role: "hr" })).toBe(false);
});
