import { getClients } from "@/services/api";
import { getSheetCache, prefetchProjectSheet } from "./sheetStore";
import { toast } from "sonner";
import { useCallback, useEffect } from "react";

export function useSheetData({ clientsProp, setClients, setLoading, setOptions, setTasks, setToday, setUpdates }) {
  const load = useCallback(() => {
    const apply = ({ data }) => {
      setTasks(data.tasks || []);
      setUpdates(data.updates || []);
      setOptions(data.options || {});
      if (data.today) setToday(data.today);
    };
    if (getSheetCache()) apply(getSheetCache());
    return prefetchProjectSheet()
      .then(apply)
      .catch(() => toast.error("Couldn't load the Management sheet. Refresh to try again."))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only when the page didn't pass its client list.
  useEffect(() => {
    if (clientsProp?.length) return;
    getClients().then((c) => setClients(c || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return { load };
}
