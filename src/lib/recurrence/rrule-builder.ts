import { RRule } from "rrule";
import { RRULE_WEEKDAY_CODES, WEEKDAYS } from "@/lib/constants";

export type Frequency = "none" | "daily" | "weekly";

// UI recurrence state -> RFC 5545 RRULE string (and back), kept intentionally
// small: the MVP supports daily and weekly-by-weekday rules only.
export interface RecurrenceState {
  frequency: Frequency;
  weekdays: number[]; // indices into WEEKDAYS (0=Mon)
}

export function buildRruleString(state: RecurrenceState): string | null {
  if (state.frequency === "none") return null;
  if (state.frequency === "daily") return "FREQ=DAILY";
  // weekly
  const codes = state.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((i) => RRULE_WEEKDAY_CODES[i]);
  if (codes.length === 0) return "FREQ=WEEKLY";
  return `FREQ=WEEKLY;BYDAY=${codes.join(",")}`;
}

export function parseRecurrenceState(rruleString: string | null): RecurrenceState {
  if (!rruleString) return { frequency: "none", weekdays: [] };
  try {
    const opts = RRule.parseString(rruleString);
    if (opts.freq === RRule.DAILY) return { frequency: "daily", weekdays: [] };
    if (opts.freq === RRule.WEEKLY) {
      const byweekday = opts.byweekday;
      const weekdays: number[] = [];
      if (byweekday != null) {
        const arr = Array.isArray(byweekday) ? byweekday : [byweekday];
        for (const w of arr) {
          // rrule Weekday.weekday is 0=Mon..6=Sun, matching our WEEKDAYS order.
          const idx = typeof w === "number" ? w : (w as { weekday: number }).weekday;
          if (idx >= 0 && idx < WEEKDAYS.length) weekdays.push(idx);
        }
      }
      return { frequency: "weekly", weekdays };
    }
  } catch {
    // fall through
  }
  return { frequency: "none", weekdays: [] };
}

/** Human summary for display, e.g. "Every Mon, Wed, Fri". */
export function describeRecurrence(state: RecurrenceState): string {
  if (state.frequency === "none") return "Does not repeat";
  if (state.frequency === "daily") return "Every day";
  if (state.weekdays.length === 0) return "Weekly";
  if (state.weekdays.length === 7) return "Every day";
  const labels = state.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((i) => WEEKDAYS[i]);
  return `Every ${labels.join(", ")}`;
}
