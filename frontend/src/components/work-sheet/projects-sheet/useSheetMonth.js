import { addDays } from "@/components/work-sheet/projects-sheet/sheetDates";
import { useCallback } from "react";

export function useSheetMonth({ allDays, month, pickedDay, today }) {
  // The sheet shows one month. "Late" and the Remark (that day's update note)
  // work off one day of it: the day on the stepper, or with "All days" today in
  // the current month, the last day of a past month, the first of a future one.
  const viewMonth = month || today.slice(0, 7);
  const monthStart = `${viewMonth}-01`;
  const monthEnd = addDays(`${addDays(`${viewMonth}-28`, 4).slice(0, 7)}-01`, -1);
  const defaultDay = today >= monthStart && today <= monthEnd ? today : today > monthEnd ? monthEnd : monthStart;
  const stepDay = pickedDay && pickedDay >= monthStart && pickedDay <= monthEnd ? pickedDay : defaultDay;
  const refDay = allDays ? defaultDay : stepDay;

  // A task belongs to the month of its Date (start date), the same way the
  // other sheets place a row by its work date - not "open at any point in the
  // month". So a September follow-up stays under September even while it is
  // still open.
  const inMonth = useCallback(
    (t) => (t.start_date || "") >= monthStart && (t.start_date || "") <= monthEnd,
    [monthStart, monthEnd]
  );
  const openInMonth = inMonth;
  const inView = inMonth;

  return { viewMonth, refDay, openInMonth, inView };
}
