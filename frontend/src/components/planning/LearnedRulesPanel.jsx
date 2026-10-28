import { useEffect, useState } from "react";
import { toast } from "sonner";

import { getLearnedRules, setLearnedRuleDisabled } from "@/services/planningApi";

const CARD = { background: "#fff", borderRadius: 12, boxShadow: "inset 0 0 0 1px rgb(234,238,244)", minWidth: 0 };

const describe = (r) =>
  r.kind === "alias"
    ? `Lines starting with “${r.example}” go to ${r.client_name || "that client"} (seen in ${r.count} lines)`
    : `“${r.example}” goes to ${r.project_name || "that project"}`;

// Planning: what the matcher has learned from held-line decisions. Hidden until it has learned something.
export default function LearnedRulesPanel() {
  const [rules, setRules] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getLearnedRules()
      .then((rows) => !cancelled && setRules(rows))
      .catch(() => !cancelled && setRules([]));
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async (rule) => {
    const disabled = !rule.disabled;
    try {
      await setLearnedRuleDisabled(rule.id, disabled);
      setRules((cur) => cur.map((r) => (r.id === rule.id ? { ...r, disabled } : r)));
    } catch {
      toast.error("Could not change this rule");
    }
  };

  if (!rules || rules.length === 0) return null;
  const on = rules.filter((r) => !r.disabled).length;
  return (
    <details data-testid="learned-rules" style={CARD}>
      <summary style={{ cursor: "pointer", padding: "14px 16px", fontSize: 14, fontWeight: 600, color: "var(--neutral-900)" }}>
        Learned from your decisions
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 400, color: "var(--neutral-500)" }}>{on} active · {rules.length} total</span>
      </summary>
      {rules.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", boxShadow: "inset 0 1px 0 rgb(243,244,246)" }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: r.disabled ? "var(--neutral-400)" : "var(--neutral-900)", textDecoration: r.disabled ? "line-through" : "none", textWrap: "pretty" }}>
            {describe(r)}
          </span>
          <button
            type="button"
            onClick={() => toggle(r)}
            style={{ height: 28, padding: "0 10px", border: "none", borderRadius: 7, background: "#fff", boxShadow: "inset 0 0 0 1px var(--neutral-200)", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "var(--neutral-900)" }}
          >
            {r.disabled ? "Turn on" : "Turn off"}
          </button>
        </div>
      ))}
    </details>
  );
}
