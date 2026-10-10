import { chipFor, sharedProjectText } from "./sharedProject";
import { clearQuickLogPreset, peekQuickLogPreset, setQuickLogPreset } from "./appActions";

const data = {
  name: "TFP Oct-26",
  summary: "Thefinpedia · 1 of 2 deliverables done · Active",
  timeline: "1 Sep 2026 – 31 Oct 2026",
  rows: [
    { name: "Mahatama Gandhi", type: "Minimalist", stage: "Design", status: "Completed", due: "7 Oct 2026" },
    { name: "Lower Beta", type: "", stage: "Content", status: "Ready for Review", due: "" },
  ],
};

test("the copied text reads as a numbered list with plain status wording", () => {
  expect(sharedProjectText(data, "https://pmt.example.com/share/abc")).toBe(
    [
      "TFP Oct-26",
      "Thefinpedia · 1 of 2 deliverables done · Active",
      "Timeline: 1 Sep 2026 – 31 Oct 2026",
      "",
      "1. Mahatama Gandhi · Minimalist · Design · Done · due 7 Oct 2026",
      "2. Lower Beta · Content · Ready for Review",
      "",
      "https://pmt.example.com/share/abc",
    ].join("\n")
  );
});

test("a project with no deliverables still copies sensibly", () => {
  expect(sharedProjectText({ name: "P", rows: [] })).toBe("P\n\nNo deliverables yet.");
});

test("status chips use the same wording as the preview image", () => {
  expect(chipFor("Completed").label).toBe("Done");
  expect(chipFor("Closed").label).toBe("Done");
  expect(chipFor("In Progress").label).toBe("In progress");
  expect(chipFor("something new").label).toBe("Not started");
});

test("Log work remembers the project for the quick logger, once", () => {
  clearQuickLogPreset();
  expect(peekQuickLogPreset()).toBeNull();
  setQuickLogPreset("proj-1");
  expect(peekQuickLogPreset()).toBe("proj-1");
  expect(peekQuickLogPreset()).toBe("proj-1"); // peeking does not use it up
  clearQuickLogPreset();
  expect(peekQuickLogPreset()).toBeNull();
});

test("a remembered project expires", () => {
  const now = Date.now();
  const spy = jest.spyOn(Date, "now").mockReturnValue(now);
  setQuickLogPreset("proj-1");
  spy.mockReturnValue(now + 31 * 60000);
  expect(peekQuickLogPreset()).toBeNull();
  spy.mockRestore();
});
