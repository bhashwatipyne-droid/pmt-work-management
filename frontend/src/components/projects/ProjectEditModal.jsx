import React, { useEffect, useState } from "react";

const ProjectEditModal = ({
  open,
  onClose,
  onSaved,
  project,
  clients = [],
  currentUserId,
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

  const inputBase =
    "w-full rounded-lg border border-input bg-white px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-[3px] focus:ring-[#2b2bb5]/20 disabled:cursor-not-allowed disabled:opacity-60";

  const labelBase =
    "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

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
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Edit Project
            </h2>

            <p className="mt-0.5 text-sm text-muted-foreground">
              Update project details.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 bg-[#f7f9fc] px-6 py-6">
          <div className="rounded-xl border border-border bg-white p-5">
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-foreground">
                Project Details
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                Update the project's basic information.
              </p>
            </div>

            {/* Project Name */}
            <div className="mb-5">
              <label className={labelBase}>
                Project Name
              </label>

              <input
                type="text"
                value={name}
                onChange={(e) =>
                  setName(e.target.value)
                }
                className={inputBase}
                placeholder="Enter project name"
                disabled={saving}
              />
            </div>

            {/* Client + POC */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className={labelBase}>
                  Client
                </label>

                <select
                  value={clientId}
                  onChange={(e) => {
                    setClientId(e.target.value);
                    setPocId("");
                  }}
                  disabled={saving}
                  className={inputBase}
                >
                  <option value="">
                    Select client
                  </option>

                  {clients.map((client) => (
                    <option
                      key={client.id}
                      value={client.id}
                    >
                      {client.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelBase}>
                  POC
                </label>

                <select
                  value={pocId}
                  onChange={(e) =>
                    setPocId(e.target.value)
                  }
                  disabled={saving}
                  className={inputBase}
                >
                  <option value="">
                    No POC selected
                  </option>

                  {availablePocs.map((contact) => (
                    <option
                      key={contact.id}
                      value={contact.id}
                    >
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <div>
                <label className={labelBase}>
                  Start Date
                </label>

                <input
                  type="date"
                  value={startDate}
                  onChange={(e) =>
                    setStartDate(e.target.value)
                  }
                  disabled={saving}
                  className={inputBase}
                />
              </div>

              <div>
                <label className={labelBase}>
                  End Date
                </label>

                <input
                  type="date"
                  value={endDate}
                  onChange={(e) =>
                    setEndDate(e.target.value)
                  }
                  disabled={saving}
                  className={inputBase}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-white px-6 py-4">
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