import { act } from "react";
import { createRoot } from "react-dom/client";
import MeetingsPage from "@/pages/MeetingsPage";

const RealDate = Date;
const FIXED = new RealDate(2026, 9, 21, 10, 30, 0).getTime();
class FixedDate extends RealDate {
  constructor(...a) {
    if (a.length === 0) super(FIXED);
    else super(...a);
  }
  static now() {
    return FIXED;
  }
}

jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }) => <>{children}</>,
  PopoverTrigger: ({ children }) => <>{children}</>,
  PopoverContent: ({ children }) => <div data-popover>{children}</div>,
}));
jest.mock("sonner", () => ({ toast: Object.assign(() => {}, { error: () => {}, success: () => {} }) }));
jest.mock("@/context/UserContext", () => ({ useUser: () => ({ currentUser: { id: "u1", role: "admin", name: "Asha" } }) }));
jest.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
jest.mock("@/services/api", () => ({
  getMeetings: () =>
    Promise.resolve([
      { id: "m1", ical_uid: "u-1", calendar: "content@finace.co", start: "2026-10-21T11:00:00", end: "2026-10-21T12:00:00", summary: "Content sync", client: { name: "ICICI" }, meet_link: "https://meet.test/x", description: "<p>Agenda</p>", my_response: "accepted" },
      { id: "m2", ical_uid: "u-1", calendar: "projects@finace.co", start: "2026-10-21T11:00:00", end: "2026-10-21T12:00:00", summary: "Content sync", client: { name: "ICICI" } },
      { id: "m3", ical_uid: "u-2", calendar: "product@finace.co", start: "2026-10-21T11:30:00", end: "2026-10-21T12:30:00", summary: "Product review", my_response: "declined" },
      { id: "m4", ical_uid: "u-3", calendar: "info@finace.co", start: "2026-10-23", end: "2026-10-24", all_day: true, summary: "Holiday" },
      { id: "m5", ical_uid: "u-4", calendar: "random@x.co", start: "2026-10-21T15:00:00", end: "2026-10-21T16:00:00", summary: "Late call" },
    ]),
  getMeetingsStatus: () =>
    Promise.resolve({
      configured: true,
      calendars: [
        { calendar: "content@finace.co", last_synced_at: "2026-10-21T04:00:00Z", event_count: 2, push: { active: true } },
        { calendar: "projects@finace.co", last_synced_at: "2026-10-21T04:00:00Z", event_count: 1, last_error: "quota exceeded", push: { active: true } },
        { calendar: "product@finace.co", last_synced_at: "2026-10-21T04:00:00Z", event_count: 1 },
      ],
    }),
  syncMeetingsNow: () => Promise.resolve(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const wait = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const clickText = async (host, re, sel = "button") => {
  const el = Array.from(host.querySelectorAll(sel)).find((b) => re.test(b.textContent));
  await act(async () => el.click());
  await wait(30);
};

beforeAll(() => { global.Date = FixedDate; });
afterAll(() => { global.Date = RealDate; });

test("meetings page: week, day, month and calendar toggle", async () => {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<MeetingsPage />); });
  await wait(80);
  const dump = [host.innerHTML];
  expect(host.textContent).toContain("Content sync");

  await clickText(host, /^Day$/);
  dump.push(host.innerHTML);
  await clickText(host, /^Month$/);
  dump.push(host.innerHTML);
  await clickText(host, /^Week$/);
  const box = host.querySelector('input[type="checkbox"]');
  await act(async () => box.click());
  await wait(30);
  dump.push(host.innerHTML);
  await act(async () => root.unmount());
  host.remove();
});
