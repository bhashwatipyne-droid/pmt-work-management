import { searchDeliverables } from "./deliverableSearch";

const c = (id, name, created, client = "Aditya Birla Sun Life", project = "ABSL Emerging") => ({
  deliverable: { id, name, type: "Reel / Short Video", created_at: created },
  project: { id: "p" + id, name: project },
  clientName: client,
});

test("every word matches, plurals and client initials count, newest first", () => {
  const list = [
    c("1", "Reel on SIP", "2026-08-01T00:00:00Z"),
    c("2", "Reels for Diwali", "2026-10-10T00:00:00Z"),
    { ...c("3", "Brochure", "2026-10-15T00:00:00Z"), deliverable: { id: "3", name: "Brochure", type: "Brochure", created_at: "2026-10-15T00:00:00Z" } },
    c("4", "Reel intro", "2026-09-01T00:00:00Z", "Invesco", "Invesco SIF"),
  ];
  const out = searchDeliverables("absl reels", list).map((m) => m.deliverable.id);
  expect(out).toEqual(["2", "1"]);
});
