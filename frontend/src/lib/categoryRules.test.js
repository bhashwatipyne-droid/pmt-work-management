import { categoryForType, categoryOverride } from "./categoryRules";
import { isDeliverableRequired } from "./deliverableRules";
import { typeChangePatch } from "./quantity";
import { resolvePasteValue } from "./worksheetPaste";

// options.deliverable_type_categories as the server sends it: Data Updation is
// Core for every team (the Animation override is applied per row, by stage).
const categories = { "Data Updation": "Core", Poster: "Core", "Project Briefing": "Non-Core" };

describe("team-specific categories (Animation: Data Updation is Non-Core)", () => {
  test("only Data Updation on the Animate stage is overridden", () => {
    expect(categoryOverride("Animate", "Data Updation")).toBe("Non-Core");
    expect(categoryOverride("Animate", "Poster")).toBeNull();
    expect(categoryOverride("Design", "Data Updation")).toBeNull();
    expect(categoryOverride("Content", "Data Updation")).toBeNull();
    expect(categoryOverride(null, "Data Updation")).toBeNull();
    expect(categoryOverride(undefined, undefined)).toBeNull();
  });

  test("categoryForType follows the stage, and falls back to the shared table", () => {
    expect(categoryForType(categories, "Data Updation", "Animate")).toBe("Non-Core");
    expect(categoryForType(categories, "Data Updation", "Design")).toBe("Core");
    expect(categoryForType(categories, "Data Updation", "Content")).toBe("Core");
    expect(categoryForType(categories, "Poster", "Animate")).toBe("Core");
    expect(categoryForType(categories, "Project Briefing", "Animate")).toBe("Non-Core");
    expect(categoryForType(categories, "Unknown type", "Animate")).toBe("");
    expect(categoryForType(undefined, "Poster", "Design")).toBe("");
  });

  test("choosing Data Updation on an Animate row sets Non-Core; on other rows it stays Core", () => {
    const animate = { id: "r1", stage: "Animate", deliverable_type: "Poster", work_category: "Core" };
    expect(typeChangePatch(animate, "Data Updation", categories).work_category).toBe("Non-Core");
    expect(typeChangePatch({ ...animate, stage: "Design" }, "Data Updation", categories).work_category).toBe("Core");
    expect(typeChangePatch({ ...animate, stage: "Content" }, "Data Updation", categories).work_category).toBe("Core");
  });

  test("changing an Animate row away from Data Updation goes back to Core", () => {
    const row = { id: "r1", stage: "Animate", deliverable_type: "Data Updation", work_category: "Non-Core" };
    expect(typeChangePatch(row, "Poster", categories).work_category).toBe("Core");
  });

  test("pasting the type follows the target row's stage", () => {
    const lookups = { options: { deliverable_types: ["Data Updation", "Poster"], deliverable_type_categories: categories } };
    const paste = (stage) =>
      resolvePasteValue(lookups, "Deliverable Type", "data updation", { id: "r1", stage });
    expect(paste("Animate")).toEqual({ deliverable_type: "Data Updation", work_category: "Non-Core" });
    expect(paste("Design")).toEqual({ deliverable_type: "Data Updation", work_category: "Core" });
  });

  test("an Animation Data Updation row on a project no longer needs a deliverable; other teams' still do", () => {
    const row = { project_id: "p1", deliverable_type: "Data Updation", work_category: "Core" };
    // rows saved as Core before the rule are still read as Non-Core on the Animate stage
    expect(isDeliverableRequired({ ...row, stage: "Animate" }, categories)).toBe(false);
    expect(isDeliverableRequired({ ...row, stage: "Design" }, categories)).toBe(true);
    expect(isDeliverableRequired({ ...row, stage: "Content" }, categories)).toBe(true);
    expect(isDeliverableRequired({ ...row, stage: "Animate", deliverable_type: "Poster" }, categories)).toBe(true);
  });
});
