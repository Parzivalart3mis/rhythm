import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { fromDateKey, toDateKey } from "@/lib/time";

export type ViewMode = "day" | "week" | "month";

/**
 * The inclusive date-key range to expand for a given view anchored on `dateKey`.
 * Week and month grids are Monday-first. Month returns the full 6-week calendar
 * grid (leading/trailing days) so density dots render on adjacent-month cells.
 */
export function viewRange(view: ViewMode, dateKey: string): { start: string; end: string } {
  const d = fromDateKey(dateKey);
  if (view === "day") {
    return { start: dateKey, end: dateKey };
  }
  if (view === "week") {
    return {
      start: toDateKey(startOfWeek(d, { weekStartsOn: 1 })),
      end: toDateKey(endOfWeek(d, { weekStartsOn: 1 })),
    };
  }
  // month
  const gridStart = startOfWeek(startOfMonth(d), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(d), { weekStartsOn: 1 });
  return { start: toDateKey(gridStart), end: toDateKey(gridEnd) };
}
