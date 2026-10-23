import { makeMatcher } from "@/lib/search";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Clock, FileText, Film, LayoutGrid, List, Palette, Search } from "lucide-react";
import { toast } from "sonner";
import { Bone, SkeletonScreen } from "@/components/skeletons/Skeletons";

import { hm } from "@/lib/planning/invoiceLogic";
import { getInvoiceProjects } from "@/services/api";
import { Avatar, FIELD, LIST_COLS, STAT_VALUE, countPill, errText, rowOf, seg, segWrap } from "./invoicingShared";

export function InvoiceList({ onOpen, refreshKey }) {
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
    const q = query.trim();
    const match = makeMatcher(q);
    const shown = (tab === "ready" ? ready : raised).filter((r) =>
      match(r.name, r.client, r.code)
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

  const listLoading = !failed && (tab === "ready" ? data.ready : data.raised) === null;
  const statsLoading = !failed && data.ready === null;

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
              {statsLoading ? <Bone className="mt-1 h-7 w-24" /> : <span style={STAT_VALUE}>{value}</span>}
              {sub && !statsLoading && <span style={{ fontSize: 12, color: "var(--neutral-500)" }}>{sub}</span>}
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

        {listLoading && (
          <SkeletonScreen label="Loading invoicing" testId="invoicing-loading-state">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="flex items-center gap-6 border-t border-slate-100 px-5 py-4">
                <span className="flex flex-1 flex-col gap-2">
                  <Bone className="h-4 w-64 max-w-full" />
                  <Bone className="h-3 w-40" />
                </span>
                <Bone className="hidden h-4 w-14 md:block" />
                <Bone className="hidden h-6 w-6 rounded-full md:block" />
                <Bone className="hidden h-6 w-6 rounded-full md:block" />
                <Bone className="hidden h-6 w-6 rounded-full md:block" />
                <Bone className="hidden h-4 w-28 md:block" />
                <Bone className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </SkeletonScreen>
        )}

        {!listLoading && list.rows.length === 0 && (
          <div style={{ padding: "40px 20px", textAlign: "center", fontSize: 14, color: "var(--neutral-500)" }}>{list.emptyText}</div>
        )}
      </div>
    </div>
  );
}
