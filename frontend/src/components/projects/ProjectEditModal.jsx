import { useEffect, useState } from "react";
import { X, ChevronRight, Briefcase, User, Building2, CalendarDays } from "lucide-react";
import { SelectPill } from "@/components/ui/SelectPill";
import { DatePill } from "@/components/ui/DatePill";

const ProjectEditModal = ({
  open,
  onClose,
  onSaved,
  project,
  clients = [],
}) => {
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [pocId, setPocId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!project || !open) return;

    setName(project.name || "");
    setClientId(project.client_id || "");
    setPocId(project.poc_id || "");
    setStartDate(project.start_date || "");
    setEndDate(project.end_date || "");
    setError("");
  }, [project, open]);

  if (!open || !project) return null;

  const selectedClient = clients.find(
    (client) => client.id === clientId
  );

  const availablePocs =
    selectedClient?.contact_persons || [];

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }

    if (!clientId) {
      setError("Please select a client.");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("End date cannot be before start date.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await onSaved({
        name: name.trim(),
        client_id: clientId,
        poc_id: pocId || null,
        start_date: startDate || null,
        end_date: endDate || null,
      });

      onClose();
    } catch (err) {
      console.error(
        "Failed to update project:",
        err
      );

      setError(
        err?.response?.data?.detail ||
          err?.message ||
          "Failed to update project."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (
          e.target === e.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: breadcrumb + close */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f0f0fd] text-[#2b2bb5]">
              <Briefcase className="h-3.5 w-3.5" />
            </span>

            <span>Projects</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="font-medium text-foreground">
              Edit
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close modal"
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Large inline title */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            disabled={saving}
            autoFocus
            className="w-full border-none bg-transparent text-2xl font-semibold tracking-tight text-foreground outline-none placeholder:text-muted-foreground/60"
          />

          {/* Pill row: POC / Client / Start date / End date */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <SelectPill
              icon={User}
              value={pocId}
              onChange={setPocId}
              placeholder="No POC"
              options={[
                { value: "", label: "No POC" },
                ...availablePocs.map((contact) => ({
                  value: contact.id,
                  label: contact.name,
                })),
              ]}
            />

            <SelectPill
              icon={Building2}
              value={clientId}
              onChange={(next) => {
                setClientId(next);
                setPocId("");
              }}
              placeholder="Select client"
              options={clients.map((c) => ({
                value: c.id,
                label: c.name,
              }))}
            />

            <DatePill
              icon={CalendarDays}
              value={startDate}
              onChange={setStartDate}
              placeholder="Start date"
            />

            <DatePill
              icon={CalendarDays}
              value={endDate}
              onChange={setEndDate}
              placeholder="End date"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#2b2bb5] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-[3px] focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:bg-[#f0f0fd] disabled:text-[#c8d5ee]"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditModal;