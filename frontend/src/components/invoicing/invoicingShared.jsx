import { FileText, Film, Palette } from "lucide-react";

import { initials } from "@/lib/planning/planningLogic";
import { INV_CATS, hm, shortDate, waitText, waitTone } from "@/lib/planning/invoiceLogic";

export const CAT_ICONS = { document: FileText, palette: Palette, film: Film };

export const segWrap = { display: "flex", padding: 2, borderRadius: 8, background: "var(--neutral-100)" };
export const seg = (on) => ({
  background: on ? "#fff" : "transparent",
  boxShadow: on ? "0 1px 2px 0 rgba(13,28,61,0.05)" : "none",
  color: on ? "var(--neutral-900)" : "var(--neutral-500)",
});

export const LIST_COLS = "minmax(0,1fr) 100px 76px 76px 76px 160px 104px 24px";
export const LINE_COLS = "minmax(220px,1fr) 160px 72px 80px 80px 190px 170px";

export const Avatar = ({ text, size, fontSize }) => (
  <span
    style={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: 9999,
      background: "var(--brand-50)",
      color: "var(--brand-700)",
      font: `600 ${fontSize}px/${size}px var(--font-ui)`,
      textAlign: "center",
    }}
  >
    {text}
  </span>
);

export const countPill = (n, bg, fg) => ({
  justifySelf: "center",
  minWidth: 28,
  height: 24,
  padding: "0 8px",
  boxSizing: "border-box",
  borderRadius: 9999,
  background: bg,
  color: fg,
  font: "600 13px/24px var(--font-core)",
  textAlign: "center",
  opacity: n ? 1 : 0.35,
});

export const STAT_VALUE = {
  font: "700 28px/36px var(--font-core)",
  letterSpacing: "-0.02em",
  color: "var(--neutral-900)",
  fontVariantNumeric: "tabular-nums",
};

export const FIELD = {
  width: "100%",
  minWidth: 0,
  height: 32,
  boxSizing: "border-box",
  border: "none",
  borderRadius: 7,
  background: "transparent",
  boxShadow: "inset 0 0 0 1px transparent",
  font: "400 14px/18px var(--font-core)",
  color: "var(--neutral-900)",
  outline: "none",
  transition: "box-shadow 120ms ease, background 120ms ease",
};

export const errText = (err, fallback) => err?.response?.data?.detail || fallback;

export const rowOf = (p, raised) => {
  const tone = waitTone(p.waiting_days, raised);
  return {
    id: p.id,
    name: p.name,
    sub: [p.client, p.code].filter(Boolean).join(" · "),
    client: p.client,
    code: p.code,
    done: shortDate(p.status_changed_at),
    c: p.counts.Content,
    d: p.counts.Design,
    a: p.counts.Animation,
    pocName: p.poc || "–",
    pocIni: initials(p.poc) || "–",
    wait: raised ? "Raised " + shortDate(p.invoice_raised_at || p.status_changed_at) : waitText(p.waiting_days),
    waitBg: tone.bg,
    waitFg: tone.fg,
    logged: hm(p.minutes) + " logged",
    minutes: p.minutes,
    waiting: p.waiting_days,
  };
};

export const toCats = (lines) =>
  INV_CATS.map((c) => {
    const its = lines
      .filter((l) => l.category === c.key)
      .map((l) => [c.key, l.name, l.type, l.qty, l.minutes, l.duration_seconds, l.link, l.id, l.made_by, l.made_by_role]);
    return {
      ...c,
      its,
      qty: its.reduce((a, i) => a + (Number(i[3]) || 0), 0),
      mins: its.reduce((a, i) => a + i[4], 0),
    };
  });
