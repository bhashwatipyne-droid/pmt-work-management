// Shared by the share-link functions (api/share-preview.js, api/share-image.js).
// Files starting with "_" are not deployed as functions of their own.
//
// A shared project link (/share/:token) is answered right here, as a small page
// with no JavaScript framework: the modal (project, progress, table, Copy to
// clipboard, Log work) and the preview tags WhatsApp's crawler reads. That is
// what makes it fast on a phone: no app bundle to download and start, and the
// response is cached at the edge so the backend (which may be asleep) is
// rarely in the way. "Log work" is the only thing that opens the app.

const BACKEND = (process.env.BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "").replace(/\/+$/, "");

// Tokens are url-safe base64; anything else is not one of ours.
const cleanToken = (value) => {
  const token = String(Array.isArray(value) ? value[0] : value || "");
  return /^[A-Za-z0-9_-]{8,128}$/.test(token) ? token : "";
};

const esc = (text) =>
  String(text == null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Same wording and colours as the preview picture.
const STATUS = {
  "Not Started": { label: "Not started", bg: "rgb(241,245,249)", fg: "rgb(71,85,105)" },
  "In Progress": { label: "In progress", bg: "rgb(219,234,254)", fg: "rgb(30,64,175)" },
  "Ready for Review": { label: "Ready for review", bg: "rgb(254,243,199)", fg: "rgb(146,64,14)" },
  "Changes Requested": { label: "Changes requested", bg: "rgb(254,226,226)", fg: "rgb(153,27,27)" },
  Completed: { label: "Done", bg: "rgb(209,250,229)", fg: "rgb(6,95,70)" },
  Closed: { label: "Done", bg: "rgb(209,250,229)", fg: "rgb(6,95,70)" },
};
const statusOf = (status) => STATUS[status] || STATUS["Not Started"];

// What "Copy to clipboard" copies: a numbered list that reads well pasted into
// WhatsApp, an email or a doc.
const copyText = (data, link = "") => {
  const lines = [data.name, data.summary || ""].filter(Boolean);
  if (data.timeline) lines.push(`Timeline: ${data.timeline}`);
  lines.push("");
  if (!data.rows || !data.rows.length) {
    lines.push("No deliverables yet.");
  } else {
    data.rows.forEach((row, i) => {
      const parts = [row.name, row.type, row.stage, statusOf(row.status).label === "Done" ? "Done" : row.status, row.due && `due ${row.due}`].filter(Boolean);
      lines.push(`${i + 1}. ${parts.join(" · ")}`);
    });
  }
  if (link) lines.push("", link);
  return lines.join("\n");
};

const head = ({ data, pageUrl, imageUrl }) => {
  const title = data.name || "Project";
  const description = data.summary || "";
  return [
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<meta name=\"robots\" content=\"noindex, nofollow\">",
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    "<meta property=\"og:type\" content=\"website\">",
    "<meta property=\"og:site_name\" content=\"PMT\">",
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:secure_url" content="${esc(imageUrl)}">`,
    "<meta property=\"og:image:type\" content=\"image/png\">",
    "<meta property=\"og:image:width\" content=\"1200\">",
    "<meta property=\"og:image:height\" content=\"630\">",
    `<meta property="og:image:alt" content="${esc(title)}">`,
    "<meta name=\"twitter:card\" content=\"summary_large_image\">",
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join("");
};

const STYLE = `
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:rgba(13,27,62,.5);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0d1b3e}
.wrap{min-height:100%;display:flex;align-items:center;justify-content:center;padding:24px}
.modal{display:flex;flex-direction:column;width:100%;max-width:900px;max-height:calc(100vh - 48px);background:#fff;border-radius:14px;box-shadow:0 20px 50px rgba(13,27,62,.3);overflow:hidden}
.top{display:flex;gap:12px;align-items:flex-start;padding:20px 24px 8px}
.top div{flex:1;min-width:0}
h1{margin:0;font-size:24px;line-height:1.3;text-wrap:pretty}
.sub{margin:2px 0 0;color:#546490;font-size:14px}
.x{flex:none;width:32px;height:32px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#64748b;text-decoration:none;font-size:20px;line-height:1}
.x:hover{background:#f1f5f9}
.bar{display:flex;align-items:center;gap:12px;padding:4px 24px 12px;color:#546490;font-size:13px}
.track{flex:1;height:8px;border-radius:4px;background:#eef0f4;overflow:hidden}
.fill{display:block;height:100%;background:#10b981;border-radius:4px}
.body{flex:1;min-height:0;overflow:auto;padding:0 24px 16px}
table{width:100%;border-collapse:collapse;font-size:14px;overflow:hidden;border-radius:10px}
th{background:#00205b;color:#fff;text-align:left;padding:10px 12px;font-size:13px;white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid #e2e7f0;vertical-align:top}
tr:nth-child(even) td{background:#f7f9fc}
.n{color:#546490;width:36px}.due{white-space:nowrap}
.chip{display:inline-block;padding:2px 10px;border-radius:999px;font-size:13px;font-weight:600;white-space:nowrap}
.empty{padding:32px 0;text-align:center;color:#546490}
.foot{display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;padding:12px 24px;border-top:1px solid #e2e8f0;background:#f8fafc}
.foot span{color:#64748b;font-size:12px}
.btns{display:flex;gap:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:8px;border:0;font:600 14px system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;cursor:pointer;text-decoration:none}
.ghost{background:#fff;color:#0d1b3e;box-shadow:inset 0 0 0 1px #cbd5e1}
.ghost:hover{background:#f8fafc}
.primary{background:#2b2bb5;color:#fff}
.primary:hover{background:#1a1a8a}
#toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#0d1b3e;color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;opacity:0;pointer-events:none;transition:opacity .15s}
#toast.on{opacity:1}
@media (max-width:700px){
  .wrap{padding:0;align-items:flex-end}
  .modal{max-height:94vh;border-radius:16px 16px 0 0}
  .top{padding:16px 16px 6px}h1{font-size:20px}
  .bar{padding:4px 16px 10px}.body{padding:0 16px 12px}
  thead{display:none}
  table,tbody{display:block}
  tr{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:12px 4px;border-bottom:1px solid #e2e7f0}
  td{display:block;padding:0;border:0;background:none!important}
  td:empty{display:none}
  td.n{display:none}
  td.name{flex:1 1 100%;font-weight:600}
  td.type,td.stage,td.due{font-size:12px;color:#546490}
  td.type:not(:empty)+td.stage:not(:empty):before,td.stage:not(:empty)+td.due:not(:empty):before{content:"· "}
  .foot{padding:12px 16px;flex-direction:column;align-items:stretch}
  .foot span{order:2;text-align:center}
  .btns{order:1}.btn{flex:1}
}
`;

// The whole page. `logWorkUrl` is where "Log work" goes (the app, which asks for
// sign-in if needed); `closeUrl` is the app's front page.
const pageHtml = ({ data, pageUrl, imageUrl, logWorkUrl, closeUrl }) => {
  const total = data.total || 0;
  const pct = total ? Math.round((100 * (data.done || 0)) / total) : 0;
  const sub = [data.client, data.status, data.timeline].filter(Boolean).join(" · ");
  const rows = (data.rows || [])
    .map((row, i) => {
      const s = statusOf(row.status);
      return (
        `<tr><td class="n">${i + 1}</td><td class="name">${esc(row.name)}</td><td class="type">${esc(row.type)}</td>` +
        `<td class="stage">${esc(row.stage)}</td>` +
        `<td class="status"><span class="chip" style="background:${s.bg};color:${s.fg}">${esc(s.label)}</span></td>` +
        `<td class="due">${esc(row.due)}</td></tr>`
      );
    })
    .join("");
  const table = rows
    ? "<table><thead><tr><th>#</th><th>Deliverable</th><th>Type</th><th>Stage</th><th>Status</th><th>Due</th></tr></thead>" +
      `<tbody>${rows}</tbody></table>`
    : "<p class=\"empty\">No deliverables yet.</p>";
  // Embedded as data, with "<" escaped so nothing in a name can end the script.
  const text = JSON.stringify(copyText(data, pageUrl)).replace(/</g, "\\u003c");
  const script = `
var TEXT=${text};
function toast(m){var t=document.getElementById("toast");t.textContent=m;t.className="on";setTimeout(function(){t.className=""},1800)}
document.getElementById("copy").addEventListener("click",function(){
  function fallback(){var a=document.createElement("textarea");a.value=TEXT;a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();try{document.execCommand("copy");toast("Copied to clipboard")}catch(e){toast("Could not copy")}document.body.removeChild(a)}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(TEXT).then(function(){toast("Copied to clipboard")},fallback)}else{fallback()}
});`;
  return (
    `<!doctype html><html lang="en"><head>${head({ data, pageUrl, imageUrl })}<style>${STYLE}</style></head><body>` +
    `<div class="wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(data.name)}">` +
    `<div class="top"><div><h1>${esc(data.name)}</h1>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}</div>` +
    `<a class="x" href="${esc(closeUrl)}" aria-label="Open PMT" title="Open PMT">&times;</a></div>` +
    `<div class="bar"><span>${data.done || 0} of ${total} deliverables done</span>` +
    `<span class="track"><span class="fill" style="width:${pct}%"></span></span><span>${pct}%</span></div>` +
    `<div class="body">${table}</div>` +
    `<div class="foot"><span>Shared from PMT</span><div class="btns">` +
    `<button class="btn ghost" id="copy" type="button">Copy to clipboard</button>` +
    `<a class="btn primary" id="log" href="${esc(logWorkUrl)}">Log work</a></div></div>` +
    `</div></div><div id="toast" role="status"></div><script>${script}</script></body></html>`
  );
};

module.exports = { BACKEND, cleanToken, esc, statusOf, copyText, pageHtml };
