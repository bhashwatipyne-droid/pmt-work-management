// Sample calendar for the Meetings screen: five made-up team calendars with
// stand-ups, client calls and reviews around today. (The real app reads these
// from Google Calendar.)

import { dayOffset } from "./seed";

export const DEMO_CALENDARS = [
  "content@demo.pmt.example",
  "projects@demo.pmt.example",
  "product@demo.pmt.example",
  "animate@demo.pmt.example",
  "info@demo.pmt.example",
];
const [CONTENT, PROJECTS, PRODUCT, ANIMATE, INFO] = DEMO_CALENDARS;

const PEOPLE = {
  kabir: ["kabir.shah@demo.pmt.example", "Kabir Shah"],
  naina: ["naina.rao@demo.pmt.example", "Naina Rao"],
  dev: ["dev.malhotra@demo.pmt.example", "Dev Malhotra"],
  meera: ["demo.admin@demo.pmt.example", "Meera Iyer"],
  anika: ["anika.sen@demo.pmt.example", "Anika Sen"],
  ishaan: ["ishaan.verma@demo.pmt.example", "Ishaan Verma"],
  arjun: ["arjun.nair@demo.pmt.example", "Arjun Nair"],
};

const CLIENTS = {
  lumen: { id: "c-lumen", name: "Lumen Health" },
  aster: { id: "c-aster", name: "Aster Bank" },
  bluepeak: { id: "c-bluepeak", name: "Bluepeak Mutual Fund" },
  orbit: { id: "c-orbit", name: "Orbit Learning" },
  savora: { id: "c-savora", name: "Savora Foods" },
};

const pad = (n) => String(n).padStart(2, "0");
const at = (offset, hour, minute = 0) => {
  const [y, m, d] = dayOffset(offset).split("-").map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
};
const dow = (offset) => new Date(`${dayOffset(offset)}T12:00:00`).getDay();

let built = null;

const build = () => {
  const events = [];
  let no = 0;
  const add = ({ calendar, calendars, uid, summary, offset, from, to, people = [], client = null, description = "", recurring = false, meet = true, allDay = false, location = "" }) => {
    const list = calendars || [calendar];
    list.forEach((cal) => {
      no += 1;
      const attendees = people.map(([email, name], i) => ({ email, name, response: i === 0 ? "accepted" : i % 3 === 0 ? "tentative" : "accepted", organizer: i === 0 }));
      events.push({
        id: `${cal}:${uid}:${offset}`,
        calendar: cal,
        event_id: `${uid}-${offset}`,
        ical_uid: `${uid}-${offset}`,
        summary,
        description,
        location,
        start: allDay ? dayOffset(offset) : at(offset, ...from),
        end: allDay ? dayOffset(offset + 1) : at(offset, ...to),
        all_day: allDay,
        attendees,
        organizer: people[0] ? people[0][0] : cal,
        my_response: "accepted",
        meet_link: meet && !allDay ? `https://meet.example.com/demo-${no}` : "",
        html_link: "",
        recurring,
        private: false,
        updated: at(-7, 9),
        synced_at: at(0, 7),
        ...(client ? { client } : {}),
      });
    });
  };

  for (let offset = -21; offset <= 42; offset += 1) {
    const w = dow(offset);
    if (w === 0 || w === 6) continue;
    add({ calendar: CONTENT, uid: "content-standup", summary: "Content daily stand-up", offset, from: [10, 0], to: [10, 15], people: [PEOPLE.kabir, PEOPLE.ishaan, PEOPLE.anika], recurring: true });
    add({ calendar: ANIMATE, uid: "animate-standup", summary: "Animation stand-up", offset, from: [10, 30], to: [10, 45], people: [PEOPLE.dev, PEOPLE.arjun], recurring: true });
    if (w === 1) {
      add({ calendars: [PROJECTS, CONTENT], uid: "weekly-planning", summary: "Weekly planning", offset, from: [11, 0], to: [12, 0], people: [PEOPLE.meera, PEOPLE.kabir, PEOPLE.naina, PEOPLE.dev], description: "Walk through the week: what is due, what is blocked, who has room.", recurring: true });
    }
    if (w === 2) {
      add({ calendar: PROJECTS, uid: "lumen-sync", summary: "Lumen Health weekly sync", offset, from: [15, 0], to: [15, 45], people: [PEOPLE.kabir, PEOPLE.meera], client: CLIENTS.lumen, description: "Wellness month status and next week's emailers.", recurring: true });
      add({ calendar: PRODUCT, uid: "product-review", summary: "Product review", offset, from: [16, 0], to: [17, 0], people: [PEOPLE.meera, PEOPLE.naina] });
    }
    if (w === 3) {
      add({ calendar: PROJECTS, uid: "orbit-call", summary: "Orbit Learning check-in", offset, from: [12, 30], to: [13, 0], people: [PEOPLE.kabir, PEOPLE.ishaan], client: CLIENTS.orbit, recurring: true });
      add({ calendar: ANIMATE, uid: "animation-review", summary: "Animation review - reels", offset, from: [14, 0], to: [15, 0], people: [PEOPLE.dev, PEOPLE.arjun, PEOPLE.naina] });
    }
    if (w === 4) {
      add({ calendars: [PROJECTS, INFO], uid: "aster-compliance", summary: "Aster Bank compliance review", offset, from: [11, 30], to: [12, 30], people: [PEOPLE.meera, PEOPLE.kabir], client: CLIENTS.aster, description: "Walk the launch film through the compliance checklist." });
      add({ calendar: CONTENT, uid: "content-retro", summary: "Content retro", offset, from: [16, 30], to: [17, 15], people: [PEOPLE.kabir, PEOPLE.ishaan, PEOPLE.anika], recurring: true });
    }
    if (w === 5) {
      add({ calendar: INFO, uid: "all-hands", summary: "Team all-hands", offset, from: [17, 0], to: [17, 30], people: [PEOPLE.meera, PEOPLE.kabir, PEOPLE.naina, PEOPLE.dev], recurring: true });
    }
  }

  add({ calendar: PROJECTS, uid: "savora-kickoff", summary: "Savora Foods festive creatives walkthrough", offset: 1, from: [11, 0], to: [12, 0], people: [PEOPLE.naina, PEOPLE.meera], client: CLIENTS.savora, location: "Client office, Pune" , meet: false });
  add({ calendar: PROJECTS, uid: "bluepeak-review", summary: "Bluepeak SIP series review", offset: 3, from: [14, 0], to: [15, 0], people: [PEOPLE.meera, PEOPLE.kabir], client: CLIENTS.bluepeak });
  add({ calendar: INFO, uid: "festival", summary: "Diwali - office closed", offset: 8, from: [0, 0], to: [0, 0], allDay: true, people: [] });
  add({ calendar: INFO, uid: "training", summary: "Design systems workshop", offset: 6, from: [15, 0], to: [17, 0], people: [PEOPLE.naina, PEOPLE.anika], description: "Hands-on session on the shared component library." });
  return events;
};

const events = () => built || (built = build());

const status = () => ({
  configured: true,
  calendars: DEMO_CALENDARS.map((calendar) => ({
    calendar,
    last_synced_at: new Date(Date.now() - 4 * 60000).toISOString(),
    last_error: "",
    event_count: events().filter((e) => e.calendar === calendar).length,
    push: { active: true, expires_at: at(5, 9), last_ping_at: at(0, 8), error: "" },
  })),
});

export const handleMeetings = ({ method, path, query }) => {
  if (!path.startsWith("/meetings")) return undefined;
  if (method === "GET" && path === "/meetings/status") return status();
  if (method === "POST" && path === "/meetings/sync") return { synced: 0 };
  if (method === "GET") {
    const start = String(query.start || "").slice(0, 10);
    const end = String(query.end || "").slice(0, 10);
    return JSON.parse(
      JSON.stringify(
        events().filter((e) => e.start.slice(0, 10) < end && (e.end || e.start).slice(0, 10) >= start).sort((a, b) => a.start.localeCompare(b.start))
      )
    );
  }
  return { ok: true };
};

export const _pad = pad;
