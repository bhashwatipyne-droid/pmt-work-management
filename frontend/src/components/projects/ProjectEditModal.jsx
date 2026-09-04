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

  const availablePocs = selectedClient?.contact_persons || [];

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
      console.error("Failed to update project:", err);
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !saving) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Edit Project
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Update project details.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-2xl leading-none text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-6">
          {/* Project Name */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Project Name
            </label>

            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              placeholder="Enter project name"
              disabled={saving}
            />
          </div>

          {/* Client + POC */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Client
              </label>

              <select
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setPocId("");
                }}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              >
                <option value="">Select client</option>

                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                POC
              </label>

              <select
                value={pocId}
                onChange={(e) => setPocId(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              >
                <option value="">No POC selected</option>

                {availablePocs.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Start Date
              </label>

              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                End Date
              </label>

              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={saving}
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectEditModal;