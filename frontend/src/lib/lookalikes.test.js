import { findSimilarProjects } from "./lookalikes";

const clientNameOf = (id) => ({ c1: "Aditya Birla Alternative" }[id] || "");
const projects = [
  { id: "p1", client_id: "c1", name: "ABSL India Growth Fund - story & design for ppt" },
  { id: "p2", client_id: "c1", name: "Emerging Market Equity Fund- story & design for ppt" },
];

test("sharing many words is similar, not 'already exists'", () => {
  const found = findSimilarProjects("ABSL Global Innovation Fund - story & design for ppt", "c1", projects, clientNameOf);
  expect(found.length).toBeGreaterThan(0);
  expect(found.some((m) => m.exact)).toBe(false);
});

test("the same name for the same client is still an exact duplicate", () => {
  const found = findSimilarProjects("absl india growth fund - story & design for ppt", "c1", projects, clientNameOf);
  expect(found[0].exact).toBe(true);
});
