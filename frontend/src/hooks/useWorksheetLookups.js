import { useEffect, useState } from "react";
import { consumePrefetch } from "@/services/prefetch";
import {
  getClients,
  getDeliverables,
  getOptions,
  getProjects,
  getWorksheetLookups,
} from "@/services/api";

// The reference data the Work Sheet needs next to the rows: dropdown options
// and the client / project / deliverable lists.
export function useWorksheetLookups({ currentUserId }) {
  const [options, setOptions] = useState({});
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deliverables, setDeliverables] = useState([]);

  useEffect(() => { getOptions().then(setOptions); }, []);

  useEffect(() => {
    if (!currentUserId) return;
    // One slim request (id/name/client only) instead of three full ones -
    // /projects used to bring every deliverable nested inside every project
    // and /deliverables then sent the same deliverables again. Already
    // started at boot when this is the landing page (see services/prefetch).
    // The fallback keeps the sheet working if the frontend is deployed before
    // the backend that has /worksheet/lookups.
    consumePrefetch("worksheet-lookups", getWorksheetLookups)
      .catch(() =>
        Promise.all([
          getClients(),
          getProjects(currentUserId, { include_deliverables: false }),
          getDeliverables(currentUserId),
        ]).then(([clients, projects, deliverables]) => ({ clients, projects, deliverables }))
      )
      .then(({ clients: c, projects: p, deliverables: d }) => {
        setClients(c || []);
        setProjects(p || []);
        setDeliverables(d || []);
      })
      .catch(() => {});
  }, [currentUserId]);

  return { options, clients, projects, deliverables };
}
