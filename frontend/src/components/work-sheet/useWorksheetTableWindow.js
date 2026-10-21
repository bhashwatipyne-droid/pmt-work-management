import { useMemo } from "react";
import {
  ESTIMATED_ROW_HEIGHT,
  GROUP_HEADER_HEIGHT,
  MIN_HEADER_HEIGHT,
  OVERSCAN,
} from "./workSheetTableConfig";

// Virtualization: which entries are on screen for the current scroll position,
// from the measured (or estimated) row heights.
export function useWorksheetTableWindow({ displayEntries, rowHeightsRef, heightVersion, scrollTop, headerHeight, viewportHeight }) {
  // Top edge of every entry, from the measured heights (estimated where a row
  // has not been measured yet). offsets[n] is the total height.
  const offsets = useMemo(() => {
    const result = new Array(displayEntries.length + 1);
    const heights = rowHeightsRef.current;
    // Rows not on screen yet are assumed to be as tall as the average of the
    // ones already measured, so the scrollbar is about right from the start.
    let measuredTotal = 0;
    heights.forEach((height) => {
      measuredTotal += height;
    });
    const estimate = heights.size
      ? Math.max(MIN_HEADER_HEIGHT, Math.round(measuredTotal / heights.size))
      : ESTIMATED_ROW_HEIGHT;
    let acc = 0;

    for (let i = 0; i < displayEntries.length; i += 1) {
      result[i] = acc;
      const entry = displayEntries[i];
      acc +=
        entry.type === "header"
          ? GROUP_HEADER_HEIGHT
          : heights.get(String(entry.item.id)) ?? estimate;
    }
    result[displayEntries.length] = acc;

    return result;
    // heightVersion is the signal that rowHeightsRef changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayEntries, heightVersion]);

  // First index whose top edge is at or past `target`.
  const indexAtOffset = (target) => {
    let low = 0;
    let high = displayEntries.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (offsets[mid] < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const bodyScrollTop = Math.max(0, scrollTop - headerHeight);

  const visibleStart = Math.max(
    0,
    indexAtOffset(bodyScrollTop + 1) - 1 - OVERSCAN
  );

  const visibleEnd = Math.min(
    displayEntries.length,
    indexAtOffset(bodyScrollTop + viewportHeight) + OVERSCAN
  );

  const visibleItems = displayEntries.slice(visibleStart, visibleEnd);
  const topSpacerHeight = offsets[visibleStart] || 0;
  const bottomSpacerHeight = Math.max(
    0,
    (offsets[displayEntries.length] || 0) - (offsets[visibleEnd] || 0)
  );

  return {
    visibleItems,
    topSpacerHeight,
    bottomSpacerHeight,
  };
}
