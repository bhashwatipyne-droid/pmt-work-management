import { useEffect, useState } from "react";

import { useUser } from "@/context/UserContext";
import { useAccess } from "@/hooks/useAccess";
import { startPolling } from "@/lib/polling";
import { onCountsRefresh } from "@/lib/countsBus";
import {
  getApprovalsPendingCount,
  getWorkItemsPendingCount,
} from "@/services/api";

// Background safety-net cadence for the nav badge counts, in case they were
// changed by someone else / another tab. Anything the current user does
// themselves refreshes instantly via the countsBus event. It pauses while the
// tab is hidden and refreshes when visible again (see startPolling).
// 45s: the Approvals count is the heaviest call the app polls (it was
// 2-3s on the free backend instance), so it runs less often.
const COUNT_POLL_MS = 45000;
const FIRST_COUNT_DELAY_MS = 1200;

// One copy of the poll for the whole shell: the desktop sidebar and the mobile
// bottom bar both read from it instead of each polling on their own.
export function useNavCounts() {
  const { currentUser } = useUser();
  const access = useAccess();
  const [approvalsCount, setApprovalsCount] = useState(0);
  const [worksheetCount, setWorksheetCount] = useState(0);

  const canSeeApprovals = access.canViewApprovals;

  useEffect(() => {
    if (!currentUser?.id) return undefined;

    let cancelled = false;

    const fetchCounts = () => {
      if (!access.canViewWorksheet) return;

      getWorkItemsPendingCount(currentUser.id)
        .then((data) => !cancelled && setWorksheetCount(data?.count || 0))
        .catch(() => {});

      if (canSeeApprovals) {
        getApprovalsPendingCount(currentUser.id)
          .then((data) => !cancelled && setApprovalsCount(data?.count || 0))
          .catch(() => {});
      }
    };

    // The badges are not what the person opened the page for, so the first
    // fetch waits a moment and lets the page's own data requests go first
    // (on a busy or waking backend those two extra queries otherwise queue in
    // front of the page).
    const firstFetch = window.setTimeout(fetchCounts, FIRST_COUNT_DELAY_MS);
    const stopPolling = startPolling(fetchCounts, COUNT_POLL_MS);
    const unsubscribe = onCountsRefresh(fetchCounts);

    return () => {
      cancelled = true;
      window.clearTimeout(firstFetch);
      stopPolling();
      unsubscribe();
    };
  }, [currentUser?.id, canSeeApprovals, access.canViewWorksheet]);

  return { worksheet: worksheetCount, approvals: approvalsCount };
}
