// The text "Copy to clipboard" puts on the clipboard for a shared project: a
// plain list that reads well when pasted into WhatsApp, an email or a doc.
export const sharedProjectText = (data, link = "") => {
  const lines = [data.name, data.summary || ""].filter(Boolean);
  if (data.timeline) lines.push(`Timeline: ${data.timeline}`);
  lines.push("");
  if (!data.rows?.length) {
    lines.push("No deliverables yet.");
  } else {
    data.rows.forEach((row, i) => {
      const status = row.status === "Completed" || row.status === "Closed" ? "Done" : row.status;
      const parts = [row.name, row.type, row.stage, status, row.due && `due ${row.due}`].filter(Boolean);
      lines.push(`${i + 1}. ${parts.join(" · ")}`);
    });
  }
  if (link) lines.push("", link);
  return lines.join("\n");
};

// Same colours as the preview image and the public page.
export const STATUS_CHIP = {
  "Not Started": { label: "Not started", bg: "rgb(241,245,249)", fg: "rgb(71,85,105)" },
  "In Progress": { label: "In progress", bg: "rgb(219,234,254)", fg: "rgb(30,64,175)" },
  "Ready for Review": { label: "Ready for review", bg: "rgb(254,243,199)", fg: "rgb(146,64,14)" },
  "Changes Requested": { label: "Changes requested", bg: "rgb(254,226,226)", fg: "rgb(153,27,27)" },
  Completed: { label: "Done", bg: "rgb(209,250,229)", fg: "rgb(6,95,70)" },
  Closed: { label: "Done", bg: "rgb(209,250,229)", fg: "rgb(6,95,70)" },
};

export const chipFor = (status) => STATUS_CHIP[status] || STATUS_CHIP["Not Started"];
