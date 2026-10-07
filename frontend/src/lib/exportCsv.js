// Shared CSV export helpers for the Projects and Work sheet pages.
//
// Everything runs in the browser from the rows already on screen, so the
// file always matches the current search / filters / sort and needs no new
// API call.

// Quote every cell, double any inner quotes, and neutralise values that a
// spreadsheet would otherwise run as a formula (=, +, -, @ at the start).
const FORMULA_START = /^[=+\-@\t\r]/;

export const csvCell = (value) => {
  let text = value == null ? "" : String(value);
  // Numbers such as -5 are fine; only guard text that looks like a formula.
  if (typeof value !== "number" && FORMULA_START.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

export const buildCsv = (header, rows) =>
  [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") +
  "\r\n";

// "Oct 7 2026" style stamp is avoided on purpose - ISO date sorts correctly
// when files pile up in a downloads folder.
export const todayStamp = () => new Date().toISOString().slice(0, 10);

// Turns a label into something safe to use inside a file name.
export const slugify = (text) =>
  String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const downloadCsv = (filename, header, rows) => {
  // The BOM makes Excel read the file as UTF-8 (₹, accents, etc.).
  const blob = new Blob(["﻿", buildCsv(header, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};