import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { ListChecks } from "lucide-react";

import { useUser } from "@/context/UserContext";
import { getBulkReviewCount } from "@/services/api";
import { onCountsRefresh, refreshCounts } from "@/lib/countsBus";
import { startPolling } from "@/lib/polling";

// Not 15s like before: every poll is a request the backend has to answer.
const BULK_POLL_MS = 60000;

const BulkReviewModal = lazy(() => import("../work-sheet/BulkReviewModal"));

// "Bulk review" in the top bar, on every page: a solid brand button with the
// number of items waiting for this reviewer in a white pill (as in the
// redesign). It owns the Bulk Review dialog, so it opens from anywhere.
//
// Managers review the work assigned to them; so do admins (members often
// name an admin as the reviewer). Members never see it.
export function BulkReviewButton() {
  const { currentUser } = useUser();
  const [open, setOpen] = useState(false);
  // The dialog (and its code) is only loaded the first time it is opened, so
  // the top bar adds nothing to every page's initial load.
  const [everOpened, setEverOpened] = useState(false);
  const [count, setCount] = useState(0);

  const canReview = currentUser?.role === "manager" || currentUser?.role === "admin";

  const fetchCount = useCallback(() => {
    if (!currentUser?.id || !canReview) return;
    getBulkReviewCount(currentUser.id)
      .then((data) => setCount(data?.count || 0))
      .catch(() => {});
  }, [currentUser?.id, canReview]);

  // A slow poll (paused while the tab is hidden) is only a safety net for
  // changes made elsewhere; this user's own actions refresh it instantly via
  // countsBus. It is deliberately slow and offset from the sidebar's polls:
  // the backend is a small instance, and requests that all fire on the same
  // tick queue behind each other.
  useEffect(() => {
    if (!canReview) return undefined;
    // First count a few seconds after the page paints, after the page's own
    // requests and the sidebar's badge counts.
    const first = setTimeout(fetchCount, 4000);
    const stopPolling = startPolling(fetchCount, BULK_POLL_MS);
    const unsubscribe = onCountsRefresh(fetchCount);
    return () => {
      clearTimeout(first);
      stopPolling();
      unsubscribe();
    };
  }, [canReview, fetchCount]);

  if (!canReview) return null;

  return (
    <>
      <button
        type="button"
        data-testid="bulk-review-btn"
        onClick={() => {
          setEverOpened(true);
          setOpen(true);
        }}
        title="Review all pending approvals at once"
        className="ml-1 flex h-8 items-center gap-2 whitespace-nowrap rounded-[7px] bg-[#2b2bb5] pl-3 pr-2.5 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-[#3d3dcc] focus-visible:ring-[3px] focus-visible:ring-[#2b2bb5]/30"
      >
        <ListChecks className="h-3.5 w-3.5" />
        Bulk review
        {count > 0 && (
          <span className="box-border h-[18px] min-w-5 rounded-full bg-white px-1.5 text-center text-[11px] font-semibold leading-[18px] text-[#1a1a8a]">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {everOpened && (
        <Suspense fallback={null}>
          <BulkReviewModal
            open={open}
            onClose={() => {
              setOpen(false);
              fetchCount();
              refreshCounts();
            }}
            currentUser={currentUser}
          />
        </Suspense>
      )}
    </>
  );
}

export default BulkReviewButton;