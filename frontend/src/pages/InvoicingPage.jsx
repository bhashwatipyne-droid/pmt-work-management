import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Clock,
  Download,
  FileText,
  Film,
  Info,
  LayoutGrid,
  Link2,
  List,
  Palette,
  Pencil,
  Receipt,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { initials } from "@/lib/planning/planningLogic";
import { INV_CATS, hm, shortDate, waitText, waitTone } from "@/lib/planning/invoiceLogic";
import {
  editInvoiceLine,
  getInvoiceProject,
  getInvoiceProjects,
  getOptions,
  raiseInvoice,
  undoRaiseInvoice,
} from "@/services/api";

// Finance's "Ready to invoice": projects an admin has moved to "Ready for
// Invoice", and a per-project costing view listing every piece, who made it and
// its link. Markup follows the design prototype; data is live from /invoicing.

const CAT_ICONS = { document: FileText, palette: Palette, film: Film };

const segWrap = { display: "flex", padding: 2, borderRadius: 8, background: "var(--neutral-100)" };
const seg = (on) => ({
  background: on ? "#fff" : "transparent",
  boxShadow: on ? "0 1px 2px 0 rgba(13,28,61,0.05)" : "none",
  color: on ? "var(--neutral-900)" : "var(--neutral-500)",
});

const LIST_COLS = "minmax(0,1fr) 100px 76px 76px 76px 160px 104px 24px";
const LINE_COLS = "minmax(220px,1fr) 160px 72px 80px 80px 190px 170px";

const Avatar = ({ text, size, fontSize }) => (
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

const countPill = (n, bg, fg) => ({
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

const STAT_VALUE = {
  font: "700 28px/36px var(--font-core)",
  letterSpacing: "-0.02em",
  color: "var(--neutral-900)",
  fontVariantNumeric: "tabular-nums",
};

const FIELD = {
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

const errText = (err, fallback) => err?.response?.data?.detail || fallback;

const rowOf = (p, raised) => {
  const tone = waitTone(p.waiting_days, raised);
  return {
    id: p.id,
    name: p.name,
    sub: p.client + " · " + p.code,
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

function InvoiceList({ onOpen, refreshKey }) {
  const [tab, setTab] = useState("ready");
  const [view, setView] = useState("table");
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ ready: null, raised: null });
  const [failed, setFailed] = useState(false);
  const [counts, setCounts] = useState({ ready: 0, raised: 0 });

  // The Ready list loads first (it is what finance opens the page for); the
  // Raised list only when its tab is opened, so a long history never slows the
  // first screen. Tab labels come from the counts the server sends with either.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getInvoiceProjects("ready")
      .then((res) => {
        if (cancelled) return;
        setCounts(res.counts);
        setData({ ready: res.projects, raised: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(errText(err, "Could not load invoicing"));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (tab !== "raised" || data.raised !== null) return undefined;
    let cancelled = false;
    getInvoiceProjects("raised")
      .then((res) => !cancelled && setData((d) => ({ ...d, raised: res.projects })))
      .catch((err) => {
        if (cancelled) return;
        setFailed(true);
        toast.error(errText(err, "Could not load invoicing"));
      });
    return () => {
      cancelled = true;
    };
  }, [tab, data.raised, refreshKey]);

  const list = useMemo(() => {
    const ready = (data.ready || []).map((p) => rowOf(p, false));
    const raised = (data.raised || []).map((p) => rowOf(p, true));
    const q = query.trim().toLowerCase();
    const shown = (tab === "ready" ? ready : raised).filter(
      (r) => !q || (r.name + " " + r.client + " " + r.code).toLowerCase().includes(q)
    );
    const sum = (k) => ready.reduce((a, r) => a + r[k], 0);
    return {
      readyCount: counts.ready,
      raisedCount: counts.raised,
      stats: {
        projects: String(ready.length),
        pieces: String(sum("c") + sum("d") + sum("a")),
        piecesSub: sum("c") + " content · " + sum("d") + " design · " + sum("a") + " animation",
        logged: hm(sum("minutes")),
        oldest: ready.length ? Math.max(...ready.map((r) => r.waiting)) + " days" : "–",
      },
      rows: shown,
      emptyText: failed
        ? "Could not load invoicing. Try again in a moment."
        : (tab === "ready" ? data.ready : data.raised) === null
          ? "Loading…"
          : q
            ? "No projects match your search."
            : tab === "ready"
              ? "Nothing waiting. Projects appear here when an admin moves them to Ready for Invoice."
              : "No invoices raised yet.",
    };
  }, [data, tab, query, failed, counts]);

  return (
    <div
      data-screen-label="Ready to invoice"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 72px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <h1 style={{ margin: 0, font: "var(--type-heading-lg)", color: "var(--neutral-900)" }}>Ready to invoice</h1>
          <p style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "var(--neutral-500)", textWrap: "pretty" }}>
            Completed projects waiting to be billed. Open a project to see every piece, who made it and its link.
          </p>
        </div>
        <span style={{ position: "relative", display: "flex", alignItems: "center", width: 260, maxWidth: "100%" }}>
          <Search size={14} style={{ position: "absolute", left: 10, color: "var(--neutral-400)", pointerEvents: "none" }} />
          <input
            aria-label="Search projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search project, client or code"
            className="pp-focus"
            style={{ ...FIELD, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", fontSize: 13, padding: "0 10px 0 32px", height: 36 }}
          />
        </span>
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", display: "flex", flexWrap: "wrap" }}>
        {[
          ["Projects ready", list.stats.projects, null],
          ["Pieces to bill", list.stats.pieces, list.stats.piecesSub],
          ["Time logged", list.stats.logged, null],
          ["Oldest waiting", list.stats.oldest, null],
        ].map(([label, value, sub], i) => (
          <div key={label} style={{ display: "contents" }}>
            {i > 0 && <div style={{ width: 1, background: "rgb(234,238,244)" }} />}
            <div style={{ flex: "1 1 160px", minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: "16px 20px" }}>
              <span style={{ fontSize: 13, color: "var(--neutral-500)" }}>{label}</span>
              <span style={STAT_VALUE}>{value}</span>
              {sub && <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{sub}</span>}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", flexWrap: "wrap" }}>
          <div role="tablist" style={segWrap}>
            {[
              ["ready", "Ready · " + list.readyCount],
              ["raised", "Invoice raised · " + list.raisedCount],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                style={{ height: 30, padding: "0 12px", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", ...seg(tab === k) }}
              >
                {label}
              </button>
            ))}
          </div>
          <span style={{ flex: 1 }} />
          <div role="group" aria-label="View" style={segWrap}>
            {[
              ["table", "Table", List],
              ["cards", "Cards", LayoutGrid],
            ].map(([k, label, Icon]) => (
              <button
                key={k}
                type="button"
                aria-label={label + " view"}
                title={label + " view"}
                onClick={() => setView(k)}
                style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 10px", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer", ...seg(view === k) }}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === "table" && list.rows.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 860 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: LIST_COLS,
                  columnGap: 12,
                  alignItems: "center",
                  height: 36,
                  padding: "0 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--neutral-500)",
                  background: "var(--neutral-50)",
                  boxShadow: "inset 0 1px 0 rgb(234,238,244), inset 0 -1px 0 rgb(234,238,244)",
                }}
              >
                <span>Project</span>
                <span>Completed</span>
                <span style={{ textAlign: "center" }}>Content</span>
                <span style={{ textAlign: "center" }}>Design</span>
                <span style={{ textAlign: "center" }}>Animation</span>
                <span>Point of contact</span>
                <span>Waiting</span>
                <span />
              </div>
              {list.rows.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="pp-hv-b50"
                  onClick={() => onOpen(r.id)}
                  style={{
                    width: "100%",
                    display: "grid",
                    gridTemplateColumns: LIST_COLS,
                    columnGap: 12,
                    alignItems: "center",
                    minHeight: 60,
                    padding: "0 16px",
                    border: "none",
                    background: "#fff",
                    boxShadow: "inset 0 -1px 0 rgb(243,244,246)",
                    textAlign: "left",
                    cursor: "pointer",
                    transition: "background 120ms ease",
                  }}
                >
                  <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2, padding: "8px 0" }}>
                    <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: "var(--neutral-900)", textWrap: "pretty" }}>{r.name}</span>
                    <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{r.sub}</span>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--neutral-700)" }}>{r.done}</span>
                  <span style={countPill(r.c, "var(--brand-50)", "var(--brand-700)")}>{r.c}</span>
                  <span style={countPill(r.d, "var(--success-100)", "rgb(0,91,75)")}>{r.d}</span>
                  <span style={countPill(r.a, "var(--warning-100)", "rgb(146,64,14)")}>{r.a}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <Avatar text={r.pocIni} size={24} fontSize={10} />
                    <span style={{ fontSize: 13, color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.pocName}</span>
                  </span>
                  <span style={{ justifySelf: "start", padding: "2px 8px", borderRadius: 9999, background: r.waitBg, color: r.waitFg, font: "600 12px/16px var(--font-ui)", whiteSpace: "nowrap" }}>
                    {r.wait}
                  </span>
                  <ChevronRight size={16} style={{ color: "var(--neutral-400)" }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {view === "cards" && list.rows.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, padding: "4px 16px 16px" }}>
            {list.rows.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-label={"Open costing for " + r.name}
                className="pp-hv-ring-brand"
                onClick={() => onOpen(r.id)}
                style={{ display: "flex", flexDirection: "column", padding: 0, border: "none", borderRadius: 12, background: "#fff", boxShadow: "inset 0 0 0 1px rgb(234,238,244)", textAlign: "left", cursor: "pointer", overflow: "hidden", transition: "box-shadow 120ms ease" }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 16px 14px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: "16px", fontWeight: 500, color: "var(--neutral-500)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.client}</span>
                    <span style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 9999, background: r.waitBg, color: r.waitFg, font: "600 12px/16px var(--font-ui)", whiteSpace: "nowrap" }}>
                      <Clock size={12} />
                      {r.wait}
                    </span>
                  </span>
                  <span style={{ fontSize: 16, lineHeight: "22px", fontWeight: 600, color: "var(--neutral-900)", textWrap: "pretty", minHeight: 44 }}>{r.name}</span>
                  <span style={{ fontSize: 12, lineHeight: "16px", color: "var(--neutral-500)" }}>
                    {r.code} · Completed {r.done} · {r.logged}
                  </span>
                </span>
                <span style={{ display: "flex", margin: "0 16px", borderRadius: 10, background: "var(--neutral-50)" }}>
                  {[
                    ["Content", r.c, FileText, "var(--brand-50)", "var(--brand-700)"],
                    ["Design", r.d, Palette, "var(--success-100)", "rgb(0,91,75)"],
                    ["Animation", r.a, Film, "var(--warning-100)", "rgb(146,64,14)"],
                  ].map(([label, n, Icon, bg, fg], i) => (
                    <span
                      key={label}
                      style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6, padding: 12, opacity: n ? 1 : 0.35, boxShadow: i ? "inset 1px 0 0 rgb(234,238,244)" : "none" }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, lineHeight: "14px", color: "var(--neutral-500)" }}>
                        <span style={{ width: 20, height: 20, borderRadius: 6, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={12} />
                        </span>
                        {label}
                      </span>
                      <span style={{ font: "700 22px/28px var(--font-core)", color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                    </span>
                  ))}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, padding: "12px 16px", boxShadow: "inset 0 1px 0 rgb(243,244,246)" }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar text={r.pocIni} size={28} fontSize={11} />
                    <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 12, lineHeight: "14px", color: "var(--neutral-500)" }}>Point of contact</span>
                      <span style={{ fontSize: 14, lineHeight: "18px", fontWeight: 600, color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.pocName}</span>
                    </span>
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 4, height: 32, padding: "0 10px 0 12px", borderRadius: 7, background: "var(--brand-50)", color: "var(--brand-700)", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>
                    View pieces
                    <ChevronRight size={16} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}

        {list.rows.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--neutral-500)" }}>{list.emptyText}</div>
        )}
      </div>
    </div>
  );
}

const toCats = (lines) =>
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

function InvoiceDetail({ projectId, onBack, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [lines, setLines] = useState([]);
  const [typeOptions, setTypeOptions] = useState([]);
  const [linkEditing, setLinkEditing] = useState(null);
  const pending = useRef({});
  const timers = useRef({});

  useEffect(() => {
    let cancelled = false;
    getInvoiceProject(projectId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setLines(d.lines);
      })
      .catch((err) => {
        toast.error(errText(err, "Could not load this project"));
        onBack();
      });
    getOptions()
      .then((o) => !cancelled && setTypeOptions(o.deliverable_types || []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const flush = useCallback(
    (id) => {
      const patch = pending.current[id];
      delete pending.current[id];
      if (!patch) return;
      editInvoiceLine(projectId, id, patch).catch((err) =>
        toast.error(errText(err, "Could not save that change"))
      );
    },
    [projectId]
  );

  const flushAll = useCallback(() => {
    Object.keys(timers.current).forEach((id) => {
      clearTimeout(timers.current[id]);
      flush(id);
    });
    timers.current = {};
  }, [flush]);

  // Edits save a moment after you stop typing; leaving the page saves what is left.
  useEffect(() => flushAll, [flushAll]);

  const cats = useMemo(() => toCats(lines), [lines]);
  if (!detail) {
    return <div style={{ padding: 48, textAlign: "center", fontSize: 14, color: "var(--neutral-500)" }}>Loading…</div>;
  }

  const project = { ...detail, done: shortDate(detail.status_changed_at), wait: detail.waiting_days };
  const isRaised = detail.status === "Raised Invoice";
  const raised = shortDate(detail.invoice_raised_at || detail.status_changed_at);
  const pieces = cats.reduce((a, k) => a + k.qty, 0);
  const logged = hm(cats.reduce((a, k) => a + k.mins, 0));
  const num = (v) => Math.max(0, parseInt(String(v).replace(/[^0-9]/g, ""), 10) || 0);

  const set = (id, patch) => {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    pending.current[id] = { ...(pending.current[id] || {}), ...patch };
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => flush(id), 700);
  };

  const raise = async () => {
    try {
      flushAll();
      await raiseInvoice(project.id);
      toast.success("Invoice raised for " + project.name);
      onChanged();
      onBack();
    } catch (err) {
      toast.error(errText(err, "Could not mark the invoice raised"));
    }
  };
  const undo = async () => {
    try {
      await undoRaiseInvoice(project.id);
      toast.success("Moved back to Ready");
      onChanged();
      onBack();
    } catch (err) {
      toast.error(errText(err, "Could not move it back"));
    }
  };
  const download = () => {
    const q = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
    const rows = [
      ["Project", project.name],
      ["Client", project.client],
      ["Point of contact", project.poc],
      [],
      ["Category", "Deliverable", "Type", "Qty", "Duration (s)", "Time", "Made by", "Link"],
    ];
    cats.forEach((k) =>
      k.its.forEach((i) =>
        rows.push([k.key, i[1], i[2], i[3], i[5] || "", hm(i[4]), i[8], i[6]])
      )
    );
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = project.code + "-pieces.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Pieces list downloaded");
  };

  return (
    <div
      data-screen-label="Invoice costing"
      style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 72px", display: "flex", flexDirection: "column", gap: 20 }}
    >
      <button
        type="button"
        className="pp-hv-n50"
        onClick={onBack}
        style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 8px", marginLeft: -8, border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-500)", fontSize: 13, cursor: "pointer" }}
      >
        <ArrowLeft size={16} />
        Ready to invoice
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <span
            style={{
              alignSelf: "flex-start",
              padding: "3px 10px",
              borderRadius: 9999,
              background: isRaised ? "var(--neutral-100)" : "var(--success-100)",
              color: isRaised ? "var(--neutral-700)" : "rgb(0,91,75)",
              font: "600 12px/16px var(--font-ui)",
            }}
          >
            {isRaised ? "Invoice raised " + raised : "Ready to invoice · waiting " + waitText(project.wait)}
          </span>
          <h1 style={{ margin: 0, font: "var(--type-heading-lg)", color: "var(--neutral-900)", textWrap: "pretty" }}>{project.name}</h1>
          <span style={{ fontSize: 14, color: "var(--neutral-500)" }}>
            {project.client} · {project.code} · Point of contact {project.poc} · Completed {project.done}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="pp-hv-n50"
            onClick={download}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 40, padding: "0 14px", border: "none", borderRadius: 7, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", color: "var(--neutral-900)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Download size={14} />
            Download list
          </button>
          {!isRaised && (
            <button
              type="button"
              className="pp-hv-b400"
              onClick={raise}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 40, padding: "0 18px", border: "none", borderRadius: 7, background: "var(--brand-500)", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <Receipt size={14} />
              Mark invoice raised
            </button>
          )}
          {isRaised && (
            <button
              type="button"
              className="pp-hv-n50"
              onClick={undo}
              style={{ height: 40, padding: "0 14px", border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-700)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              Move back to Ready
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {cats.map((k) => {
          const Icon = CAT_ICONS[k.icon];
          const makers = [...new Set(k.its.map((i) => i[8]))].join(", ") || "No pieces";
          return (
            <div
              key={k.key}
              style={{ background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", padding: 16, display: "flex", flexDirection: "column", gap: 12, opacity: k.qty ? 1 : 0.5 }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: k.tint, color: k.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon size={16} />
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>{k.key}</span>
                <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{hm(k.mins) + " logged"}</span>
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ font: "700 32px/40px var(--font-core)", color: "var(--neutral-900)", fontVariantNumeric: "tabular-nums" }}>{k.qty}</span>
                <span style={{ fontSize: 14, color: "var(--neutral-500)" }}>{k.qty === 1 ? "piece" : "pieces"}</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 12, boxShadow: "inset 0 1px 0 rgb(243,244,246)" }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: "var(--neutral-500)" }}>{makers}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "14px 20px" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--neutral-900)" }}>Pieces from PMT</h2>
          <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{pieces + " pieces · " + logged + " logged in PMT"}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1000 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: LINE_COLS,
                columnGap: 8,
                alignItems: "center",
                height: 32,
                padding: "0 16px",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--neutral-500)",
                background: "var(--neutral-50)",
                boxShadow: "inset 0 1px 0 rgb(234,238,244), inset 0 -1px 0 rgb(234,238,244)",
              }}
            >
              <span style={{ paddingLeft: 10 }}>Deliverable</span>
              <span style={{ paddingLeft: 10 }}>Type</span>
              <span style={{ textAlign: "right", paddingRight: 10 }}>Qty</span>
              <span style={{ textAlign: "right", paddingRight: 10 }}>Duration</span>
              <span style={{ textAlign: "right" }}>Time</span>
              <span>Made by</span>
              <span style={{ paddingLeft: 10 }}>Link</span>
            </div>

            {cats.map(
              (k) =>
                k.its.length > 0 && (
                  <div key={k.key}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 40, padding: "0 26px", background: "var(--neutral-50)", boxShadow: "inset 0 -1px 0 rgb(243,244,246)" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 9999, background: k.fg }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-900)" }}>{k.key}</span>
                      <span style={{ flex: 1, fontSize: 12, color: "var(--neutral-500)" }}>
                        {k.qty + (k.qty === 1 ? " piece" : " pieces") + " · " + hm(k.mins) + " logged"}
                      </span>
                    </div>
                    {k.its.map((i) => {
                      const ix = i[7];
                      const isAnim = k.key === "Animation";
                      const by = i[8];
                      const editing = linkEditing === project.id + "|" + ix;
                      const types = typeOptions.includes(i[2]) || !i[2] ? typeOptions : [...typeOptions, i[2]];
                      return (
                        <div
                          key={ix}
                          style={{ display: "grid", gridTemplateColumns: LINE_COLS, columnGap: 8, alignItems: "center", minHeight: 48, padding: "0 16px", background: "#fff", boxShadow: "inset 0 -1px 0 rgb(243,244,246)" }}
                        >
                          <input
                            aria-label="Deliverable name"
                            value={i[1]}
                            onChange={(e) => set(ix, { name: e.target.value })}
                            className="pp-edit pp-focus"
                            style={{ ...FIELD, padding: "0 10px" }}
                          />
                          <select
                            aria-label="Type"
                            value={i[2]}
                            onChange={(e) => set(ix, { type: e.target.value })}
                            className="pp-edit pp-focus"
                            style={{ ...FIELD, padding: "0 6px", fontSize: 13, cursor: "pointer" }}
                          >
                            {types.map((t) => (
                              <option key={t} value={t}>
                                {t}
                              </option>
                            ))}
                          </select>
                          <input
                            aria-label="Quantity"
                            inputMode="numeric"
                            value={String(i[3])}
                            onChange={(e) => set(ix, { qty: num(e.target.value) })}
                            className="pp-focus"
                            style={{ ...FIELD, padding: "0 10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", boxShadow: "inset 0 0 0 1px var(--neutral-200)", background: "#fff" }}
                          />
                          {isAnim ? (
                            <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
                              <input
                                aria-label="Duration in seconds"
                                inputMode="numeric"
                                value={i[5] ? String(i[5]) : ""}
                                onChange={(e) => set(ix, { duration_seconds: num(e.target.value) })}
                                className="pp-focus"
                                style={{ ...FIELD, padding: "0 22px 0 8px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", boxShadow: "inset 0 0 0 1px var(--neutral-200)", background: "#fff" }}
                              />
                              <span style={{ position: "absolute", right: 8, fontSize: 12, color: "var(--neutral-500)", pointerEvents: "none" }}>s</span>
                            </span>
                          ) : (
                            <span style={{ textAlign: "right", paddingRight: 10, fontSize: 13, color: "var(--neutral-300)" }}>–</span>
                          )}
                          <span style={{ textAlign: "right", fontSize: 13, color: "var(--neutral-700)", fontVariantNumeric: "tabular-nums" }}>{hm(i[4])}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                            <Avatar text={initials(by)} size={24} fontSize={10} />
                            <span style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: 13, lineHeight: "16px", color: "var(--neutral-900)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{by}</span>
                              <span style={{ fontSize: 11, lineHeight: "14px", color: "var(--neutral-500)" }}>{i[9]}</span>
                            </span>
                          </span>
                          {!editing ? (
                            <span style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0, paddingLeft: 4 }}>
                              <a
                                href={i[6]}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={i[6]}
                                className="pp-hv-b50"
                                style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 6px", borderRadius: 7, color: "var(--brand-500)", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
                              >
                                <Link2 size={14} />
                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Open work</span>
                              </a>
                              <button
                                type="button"
                                aria-label="Edit link"
                                title="Edit link"
                                className="pp-hv-n50"
                                onClick={() => setLinkEditing(project.id + "|" + ix)}
                                style={{ width: 28, height: 28, flexShrink: 0, border: "none", borderRadius: 7, background: "transparent", color: "var(--neutral-400)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                              >
                                <Pencil size={12} />
                              </button>
                            </span>
                          ) : (
                            <input
                                              aria-label="Work link"
                              autoFocus
                              value={i[6]}
                              placeholder="Paste link"
                              onChange={(e) => set(ix, { link: e.target.value })}
                              onBlur={() => setLinkEditing(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === "Escape") setLinkEditing(null);
                              }}
                              style={{ ...FIELD, padding: "0 8px", fontSize: 12, boxShadow: "inset 0 0 0 1px var(--brand-500), 0 0 0 3px var(--brand-100)", background: "#fff" }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 20px", fontSize: 12, color: "var(--neutral-500)" }}>
          <Info size={12} />
          Click any name, type, quantity or duration to edit. Use the pencil to change a work link.
        </div>
      </div>
    </div>
  );
}

export default function InvoicingPage() {
  const [openId, setOpenId] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div data-testid="invoicing-page" style={{ flex: 1, minHeight: 0, overflow: "auto", position: "relative", background: "#fff" }}>
      {openId ? (
        <InvoiceDetail projectId={openId} onBack={() => setOpenId(null)} onChanged={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <InvoiceList onOpen={setOpenId} refreshKey={refreshKey} />
      )}
    </div>
  );
}
