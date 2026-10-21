import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getWorkItems } from "@/services/api";
import { consumePrefetch, WORKSHEET_INITIAL_ROW_LIMIT } from "@/services/prefetch";

// Loads the Work Sheet's rows: a small first slice so the sheet paints fast,
// then the full list behind it. Returns fetchItems(showLoading) for refreshes.
export function useWorksheetItemsLoader({
  currentUser,
  setItems,
  setLoading,
  setLoadingFullList,
}) {
  // How many rows to ask for in the fast initial slice — small enough to
  // paint quickly even with thousands of total rows, large enough that
  // most people won't notice the list is still partial for the second
  // or so before the full set lands.
  const INITIAL_ROW_LIMIT = WORKSHEET_INITIAL_ROW_LIMIT;
  const hasLoadedFullListRef = useRef(false);

  const fetchItems = (showLoading = true) => {
    if (!currentUser) return;
    if (showLoading) {
      setLoading(true);
    }

    // Only the very first load (not a refresh after an edit, not the
    // periodic background sync) gets the two-phase treatment — those
    // other callers want the accurate full set directly, not a partial
    // slice.
    if (showLoading && !hasLoadedFullListRef.current) {
      setLoadingFullList(true);

      // Already in flight from boot when this is the landing page.
      let gotEverything = false;

      consumePrefetch("worksheet-items-initial", () =>
        getWorkItems(currentUser.id, { limit: INITIAL_ROW_LIMIT, hide_unassigned_content: true })
      )
        .then((data) => {
          const rows = Array.isArray(data) ? data : [];
          setItems(rows);
          // Fewer rows than we asked for means that WAS the whole list, so
          // the second, unbounded request below would only re-download and
          // re-validate the same rows.
          gotEverything = rows.length < INITIAL_ROW_LIMIT;
        })
        .catch(() => {
          // Swallowed — the full fetch below still runs and its own
          // catch surfaces a toast if that fails too.
        })
        .finally(() => {
          setLoading(false);

          if (gotEverything) {
            hasLoadedFullListRef.current = true;
            setLoadingFullList(false);
            return;
          }

          getWorkItems(currentUser.id, { hide_unassigned_content: true })
            .then((data) => {
              setItems(Array.isArray(data) ? data : []);
              hasLoadedFullListRef.current = true;
            })
            .catch(() => toast.error("Could not load work items"))
            .finally(() => setLoadingFullList(false));
        });

      return;
    }

    // Fetches the whole dataset, unfiltered. Every filter and tab switch
    // below is applied client-side against this single copy — no network
    // round-trip per filter change, so it's instant instead of waiting
    // on a request each time (and immune to a slow/sleeping backend
    // instance).
    getWorkItems(currentUser.id, { hide_unassigned_content: true })
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        hasLoadedFullListRef.current = true;
      })
      .catch(() => toast.error("Could not load work items"))
      .finally(() => {
        if (showLoading) {
          setLoading(false);
        }
      });
  };

  useEffect(() => {
    hasLoadedFullListRef.current = false;
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return { fetchItems };
}
