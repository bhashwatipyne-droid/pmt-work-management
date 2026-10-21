import { consumePrefetch } from "@/services/prefetch";
import { getProjectTasks } from "@/services/api";

// The sheet's data is fetched once and kept for the session: the Work Sheet
// page starts the request as soon as it opens (prefetchProjectSheet), so the
// Management tab shows straight away, then refreshes quietly in the background.
let sheetCache = null;
export const getSheetCache = () => sheetCache;
let sheetRequest = null;
export function prefetchProjectSheet() {
  if (!sheetRequest) {
    // Started at boot on the Work Sheet (services/prefetch); clients are not
    // waited for - the page already has them.
    sheetRequest = consumePrefetch("project-tasks", getProjectTasks)
      .then((data) => {
        sheetCache = { data };
        return sheetCache;
      })
      .finally(() => {
        sheetRequest = null;
      });
  }
  return sheetRequest;
}
