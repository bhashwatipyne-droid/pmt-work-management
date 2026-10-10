// The Vercel function that serves a shared project page (frontend/api).
const { cleanToken, copyText, pageHtml, statusOf } = require("../../api/_share");
const { setQuickLogPreset, peekQuickLogPreset, clearQuickLogPreset } = require("./appActions");

const data = {
  name: 'Contra <Fund> & "Co"',
  summary: "Thefinpedia · 1 of 2 deliverables done · Active",
  client: "Thefinpedia",
  status: "Active",
  timeline: "1 Sep 2026 – 31 Oct 2026",
  project_id: "proj-1",
  done: 1,
  total: 2,
  rows: [
    { name: "Mahatama </script> Gandhi", type: "Minimalist", stage: "Design", status: "Completed", due: "7 Oct 2026" },
    { name: "Lower Beta", type: "", stage: "Content", status: "Ready for Review", due: "" },
  ],
};
const page = () =>
  pageHtml({
    data,
    pageUrl: "https://pmt.example.com/share/abc12345",
    imageUrl: "https://pmt.example.com/api/share-image?token=abc12345&v=1-2-CR",
    logWorkUrl: "https://pmt.example.com/?log_work=proj-1",
    closeUrl: "https://pmt.example.com/",
  });

test("only tokens that look like ours are used", () => {
  expect(cleanToken("CyMqbXoI1iyN7q6KdqCpl6tQ")).toBe("CyMqbXoI1iyN7q6KdqCpl6tQ");
  expect(cleanToken(["abc_DEF-12345"])).toBe("abc_DEF-12345");
  ["", "../../etc/passwd", "a b c d e f g h", "short", "x".repeat(200), undefined].forEach((bad) =>
    expect(cleanToken(bad)).toBe("")
  );
});

test("the page carries the card's title, summary and picture, escaped", () => {
  const html = page();
  expect(html).toContain('<meta property="og:title" content="Contra &lt;Fund&gt; &amp; &quot;Co&quot;">');
  expect(html).toContain('<meta property="og:description" content="Thefinpedia · 1 of 2 deliverables done · Active">');
  expect(html).toContain('<meta property="og:image" content="https://pmt.example.com/api/share-image?token=abc12345&amp;v=1-2-CR">');
  expect(html).toContain('<meta property="og:url" content="https://pmt.example.com/share/abc12345">');
  expect(html).toContain('content="summary_large_image"');
  expect(html).not.toContain("<Fund>");
  expect(html).not.toMatch(/http-equiv="refresh"/i);
});

test("the page is the modal: progress, the table, and the two buttons", () => {
  const html = page();
  expect(html).toContain("1 of 2 deliverables done");
  expect(html).toContain("width:50%");
  expect(html).toContain('<span class="chip" style="background:rgb(209,250,229);color:rgb(6,95,70)">Done</span>');
  expect(html).toContain("Ready for review");
  expect(html).toContain('id="copy" type="button">Copy to clipboard</button>');
  expect(html).toContain('<a class="btn primary" id="log" href="https://pmt.example.com/?log_work=proj-1">Log work</a>');
  // no app bundle: the only script is the small inline one
  expect((html.match(/<script/g) || []).length).toBe(1);
  expect(html).not.toMatch(/<script[^>]+src=/);
});

test("nothing in a project can break out of the page or the inline script", () => {
  const html = page();
  expect(html).not.toContain("Mahatama </script>");
  expect(html).toContain("Mahatama &lt;/script&gt; Gandhi");
  // inside the script the "<" is escaped
  const script = html.slice(html.lastIndexOf("<script>"));
  expect(script).toContain("\\u003c/script>");
  expect(script.match(/<\/script>/g).length).toBe(1);
});

test("a project with no deliverables still renders", () => {
  const html = pageHtml({
    data: { name: "P", rows: [], total: 0, done: 0 },
    pageUrl: "https://x/share/abcdefgh",
    imageUrl: "https://x/i.png",
    logWorkUrl: "https://x/?log_work=p",
    closeUrl: "https://x/",
  });
  expect(html).toContain("No deliverables yet.");
  expect(html).toContain("0 of 0 deliverables done");
});

test("status wording matches the preview picture", () => {
  expect(statusOf("Completed").label).toBe("Done");
  expect(statusOf("Closed").label).toBe("Done");
  expect(statusOf("In Progress").label).toBe("In progress");
  expect(statusOf("something new").label).toBe("Not started");
});

test("the copied text is a numbered list with plain status wording", () => {
  expect(copyText({ ...data, rows: [data.rows[1], { ...data.rows[0], name: "Gandhi" }] }, "https://pmt.example.com/share/abc")).toBe(
    [
      'Contra <Fund> & "Co"',
      "Thefinpedia · 1 of 2 deliverables done · Active",
      "Timeline: 1 Sep 2026 – 31 Oct 2026",
      "",
      "1. Lower Beta · Content · Ready for Review",
      "2. Gandhi · Minimalist · Design · Done · due 7 Oct 2026",
      "",
      "https://pmt.example.com/share/abc",
    ].join("\n")
  );
  expect(copyText({ name: "P", rows: [] })).toBe("P\n\nNo deliverables yet.");
});

test("Log work remembers the project for the quick logger, and it expires", () => {
  clearQuickLogPreset();
  expect(peekQuickLogPreset()).toBeNull();
  setQuickLogPreset("proj-1");
  expect(peekQuickLogPreset()).toBe("proj-1");
  const now = Date.now();
  const spy = jest.spyOn(Date, "now").mockReturnValue(now + 31 * 60000);
  expect(peekQuickLogPreset()).toBeNull();
  spy.mockRestore();
});
