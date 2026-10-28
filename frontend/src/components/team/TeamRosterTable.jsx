import { ROLE_LABELS } from "@/lib/permissions";
import { Pencil, Trash2 } from "lucide-react";

import { TEAM } from "@/constants/testIds";

export function TeamRosterTable({ roster, setEditingMember, onRemoveMember }) {
  return (
        <div className="overflow-x-auto">
          <table
            data-testid={TEAM.rosterTable}
            className="w-full min-w-[720px] text-left text-sm"
          >
            <thead>
              <tr className="border-b border-border bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Username</th>
                <th className="py-2 pr-4">Email ID</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
              </tr>
            </thead>

            <tbody>
              {roster.map((m) => {
                return (
                  <tr
                    key={m.id}
                    data-testid={`${TEAM.rowPrefix}-${m.id}`}
                    className="border-b border-border last:border-0 transition-colors hover:bg-[#fafbff]"
                  >
                    <td className="py-3 pr-4 font-semibold text-slate-900">
                      {m.name}
                    </td>

                    <td className="py-3 pr-4 text-slate-600">
                      {m.username || "—"}
                    </td>

                    <td className="py-3 pr-4 text-sm text-muted-foreground">
                      {m.email || "—"}
                    </td>

                    <td className="py-3 pr-4 text-sm text-slate-600">
                      {m.department || "—"}
                    </td>

                    <td className="py-3 pr-4 text-sm capitalize text-slate-600">
                      {ROLE_LABELS[m.role] || m.role}
                    </td>

                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingMember(m)}
                          className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>

                        {onRemoveMember && (
                          <button
                            type="button"
                            data-testid={`team-remove-${m.id}`}
                            onClick={() => onRemoveMember(m)}
                            title={`Remove ${m.name}`}
                            aria-label={`Remove ${m.name}`}
                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        <span
                          data-testid={`${TEAM.activeBadgePrefix}-${m.id}`}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            m.active === false
                              ? "bg-slate-100 text-slate-500"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {m.active === false
                            ? "Inactive"
                            : "Active"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
  );
}
