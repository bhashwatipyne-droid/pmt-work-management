import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Info, Link2, Pencil, Receipt } from "lucide-react";
import { toast } from "sonner";

import { initials } from "@/lib/planning/planningLogic";
import { hm, shortDate, waitText } from "@/lib/planning/invoiceLogic";
import { editInvoiceLine, getInvoiceProject, getOptions, raiseInvoice, undoRaiseInvoice } from "@/services/api";
import { Avatar, CAT_ICONS, FIELD, LINE_COLS, errText, toCats } from "./invoicingShared";

export function InvoiceDetail({ projectId, onBack, onChanged }) {
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
