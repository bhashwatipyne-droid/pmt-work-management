// The Vercel functions that answer link-preview crawlers (frontend/api).
const { cleanToken, isPreviewBot, previewHtml } = require("../../api/_share");

test("WhatsApp and the other preview crawlers are recognised, browsers are not", () => {
  [
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Mozilla/5.0 (compatible; Twitterbot/1.0)",
    "TelegramBot (like TwitterBot)",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  ].forEach((ua) => expect(isPreviewBot(ua)).toBe(true));
  [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
  ].forEach((ua) => expect(isPreviewBot(ua)).toBe(false));
});

test("only tokens that look like ours are used", () => {
  expect(cleanToken("CyMqbXoI1iyN7q6KdqCpl6tQ")).toBe("CyMqbXoI1iyN7q6KdqCpl6tQ");
  expect(cleanToken(["abc_DEF-12345"])).toBe("abc_DEF-12345");
  ["", "../../etc/passwd", "a b c d e f g h", "short", "x".repeat(200), undefined].forEach((bad) =>
    expect(cleanToken(bad)).toBe("")
  );
});

test("the page carries the card's title, summary and picture, escaped", () => {
  const html = previewHtml({
    data: { name: 'Contra <Fund> & "Co"', summary: "Client · 1 of 3 deliverables done · Active" },
    pageUrl: "https://pmt.example.com/share/abc12345",
    imageUrl: "https://pmt.example.com/api/share-image?token=abc12345&v=1-3-CIN",
  });
  expect(html).toContain('<meta property="og:title" content="Contra &lt;Fund&gt; &amp; &quot;Co&quot;">');
  expect(html).toContain('<meta property="og:description" content="Client · 1 of 3 deliverables done · Active">');
  expect(html).toContain('<meta property="og:image" content="https://pmt.example.com/api/share-image?token=abc12345&amp;v=1-3-CIN">');
  expect(html).toContain('<meta property="og:url" content="https://pmt.example.com/share/abc12345">');
  expect(html).toContain('content="summary_large_image"');
  expect(html).not.toContain("<Fund>");
  // a crawler that followed a refresh would end up on the app and see no tags
  expect(html).not.toMatch(/http-equiv="refresh"/i);
});
