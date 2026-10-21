import { MAX_QUANTITY, deliverableIdsOf, deliverableListPatch, durationPatch, isMultiDeliverableRow, parseDurationSeconds, qtyApplies } from "@/lib/quantity";
import { NOT_AVAILABLE_LABEL } from "@/lib/deliverableRules";
import { STAGES, noDeliverablesFor } from "@/components/work-sheet/workSheetTableConfig";
import { parseTimeInput } from "@/lib/timeRules";

// Turns text pasted into a Work Sheet cell into the field change it means
// (or null when the text is not valid for that column). Pure: everything it
// needs to look names up in comes in through `lookups`.
export const resolvePasteValue = (
  { clients, projects, deliverablesByProject, options, nonAdminUsers, reviewerUsers },
  column,
  rawText,
  targetItem
) => {
  const text = (rawText ?? "").trim();
  const clear = text === "" || text === "—" || text === "-";
  const ciEquals = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

  switch (column) {
    case "Date": {
      if (clear) return { work_date: "" };
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { work_date: text };
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;
      return { work_date: parsed.toISOString().slice(0, 10) };
    }
    case "Client": {
      // A Campaign Ideation Plan row's ticked deliverables go with its project.
      const noProjects = noDeliverablesFor(targetItem);
      if (clear) {
        return {
          client_id: null,
          project_id: null,
          deliverable_id: null,
          deliverable_not_available: false,
          ...noProjects,
        };
      }
      const match = clients.find((c) => ciEquals(c.name, text));
      if (!match) return null;
      return {
        client_id: match.id,
        project_id: null,
        deliverable_id: null,
        deliverable_not_available: false,
        ...noProjects,
      };
    }
    case "Project": {
      if (clear) {
        return {
          project_id: null,
          deliverable_id: null,
          deliverable_not_available: false,
          ...noDeliverablesFor(targetItem),
        };
      }
      const currentProject = projects.find(
        (p) => p.id === targetItem.project_id
      );
      const effectiveClientId =
        targetItem.client_id || currentProject?.client_id;
      const pool = effectiveClientId
        ? projects.filter((p) => p.client_id === effectiveClientId)
        : projects;
      const match = pool.find((p) => ciEquals(p.name, text));
      if (!match) return null;
      return {
        project_id: match.id,
        deliverable_id: null,
        deliverable_not_available: false,
        ...noDeliverablesFor(targetItem),
      };
    }
    case "Deliverable": {
      if (clear) {
        return {
          deliverable_id: null,
          deliverable_not_available: false,
          ...noDeliverablesFor(targetItem),
        };
      }
      // "Not available" only makes sense on a row that has a project.
      if (ciEquals(text, NOT_AVAILABLE_LABEL)) {
        if (!targetItem.project_id) return null;
        return {
          deliverable_id: null,
          deliverable_not_available: true,
          ...noDeliverablesFor(targetItem),
        };
      }
      const pool = deliverablesByProject[targetItem.project_id] || [];
      const match = pool.find((d) => ciEquals(d.name, text));
      if (!match) return null;
      return {
        deliverable_id: match.id,
        deliverable_not_available: false,
        // Pasting one deliverable onto a Campaign Ideation Plan row leaves
        // it covering just that deliverable.
        ...(isMultiDeliverableRow(targetItem)
          ? deliverableListPatch(targetItem, [match.id])
          : {}),
      };
    }
    case "Stage": {
      if (clear) return { stage: null };
      const match = STAGES.find((s) => ciEquals(s, text));
      if (!match) return null;
      return { stage: match };
    }
    case "Deliverable Name":
      return { deliverable_name: clear ? "" : text };
    case "Deliverable Link":
      return { deliverable_link: clear ? "" : text };
    case "Deliverable Type": {
      if (clear) return { deliverable_type: "", work_category: "" };
      const match = (options.deliverable_types || []).find((t) =>
        ciEquals(t, text)
      );
      if (!match) return null;
      return {
        deliverable_type: match,
        work_category: options.deliverable_type_categories?.[match] || "",
      };
    }
    // Category is derived from Type, not directly editable anywhere
    // else in the sheet — paste shouldn't be able to set it either.
    case "Category":
      return null;
    case "Version":
      return { version: clear ? "" : text };
    case "Qty": {
      // Only Design / Animate rows have a typed quantity; a Campaign
      // Ideation Plan row's comes from its ticked deliverables (clearing it
      // only clears the time for each).
      if (!qtyApplies(targetItem)) return null;
      if (isMultiDeliverableRow(targetItem)) {
        return clear
          ? { quantity_items: deliverableIdsOf(targetItem).map(() => null) }
          : null;
      }
      if (clear) return { quantity: 1, quantity_items: [] };
      const n = Number(text.replace(/[^\d]/g, ""));
      if (!Number.isInteger(n) || n < 1 || n > MAX_QUANTITY) return null;
      return { quantity: n, quantity_items: Array(n).fill(null) };
    }
    case "Duration": {
      if (targetItem.stage !== "Animate") return null;
      if (clear) return durationPatch(null);
      // A bare number is seconds; "3m 20s" and "3:20" work too.
      const parsed = parseDurationSeconds(text);
      if (!parsed.ok || parsed.seconds == null) return null;
      return durationPatch(parsed.seconds);
    }
    case "Time (min)": {
      if (clear) return { time_taken_minutes: 0 };
      const num = Number(text.replace(/[^\d.-]/g, ""));
      // Anything the server would refuse (not a number, negative, over 24 h)
      // is ignored like an unmatched value, instead of failing silently later.
      if (!parseTimeInput(String(num)).ok) return null;
      return { time_taken_minutes: num };
    }
    case "Creator": {
      if (clear) return { creator_id: null };
      const match = nonAdminUsers.find((u) => ciEquals(u.name, text));
      if (!match) return null;
      return { creator_id: match.id };
    }
    case "Reviewer": {
      if (clear) return { reviewer_id: null };
      const match = reviewerUsers.find((u) => ciEquals(u.name, text));
      if (!match) return null;
      return { reviewer_id: match.id };
    }
    case "Remarks":
      return { remarks: clear ? "" : text };
    case "Status": {
      const match = (options.statuses || []).find((s) => ciEquals(s, text));
      if (!match) return null;
      return { status: match };
    }
    default:
      return null;
  }
};
