import { RRule } from "rrule";
import { RRULE_WEEKDAY_CODES, WEEKDAYS } from "@/lib/constants";

/**
 * `unsupported` means the stored rule is valid RFC 5545 but outside what this
 * editor can represent. It must round-trip untouched: silently parsing it as
 * "none" and saving would convert a live series into a single one-off block.
 */
export type Frequency =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "unsupported";

// UI recurrence state -> RFC 5545 RRULE string (and back), kept intentionally
// small: the MVP supports daily and weekly-by-weekday rules only.
export interface RecurrenceState {
  frequency: Frequency;
  weekdays: number[]; // indices into WEEKDAYS (0=Mon)
  /** Day of month for monthly rules, 1-31. */
  monthDay?: number;
  /** Inclusive last date, "YYYY-MM-DD". Absent means the series never ends. */
  until?: string | null;
}

/** RRULE UNTIL is a UTC timestamp; we store an inclusive local date. */
function untilStamp(dateKey: string): string {
  return `${dateKey.replace(/-/g, "")}T235959Z`;
}

function untilDateKey(until: Date): string {
  const y = until.getUTCFullYear();
  const m = String(until.getUTCMonth() + 1).padStart(2, "0");
  const d = String(until.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function buildRruleString(state: RecurrenceState): string | null {
  if (state.frequency === "none") return null;
  // Callers must send back the original string for a rule we can't build.
  if (state.frequency === "unsupported") return null;

  const parts: string[] = [];
  if (state.frequency === "daily") {
    parts.push("FREQ=DAILY");
  } else if (state.frequency === "monthly") {
    parts.push("FREQ=MONTHLY");
    if (state.monthDay) parts.push(`BYMONTHDAY=${state.monthDay}`);
  } else {
    parts.push("FREQ=WEEKLY");
    const codes = state.weekdays
      .slice()
      .sort((a, b) => a - b)
      .map((i) => RRULE_WEEKDAY_CODES[i]);
    if (codes.length > 0) parts.push(`BYDAY=${codes.join(",")}`);
  }
  if (state.until) parts.push(`UNTIL=${untilStamp(state.until)}`);
  return parts.join(";");
}

export function parseRecurrenceState(rruleString: string | null): RecurrenceState {
  if (!rruleString) return { frequency: "none", weekdays: [] };
  try {
    const opts = RRule.parseString(rruleString);
    const until = opts.until ? untilDateKey(opts.until) : null;
    if (opts.freq === RRule.DAILY) {
      return { frequency: "daily", weekdays: [], until };
    }
    if (opts.freq === RRule.MONTHLY) {
      const bmd = opts.bymonthday;
      const monthDay = Array.isArray(bmd) ? bmd[0] : bmd;
      // Only plain "day N of the month" rules round-trip; anything richer
      // (BYSETPOS, BYDAY ordinals) stays unsupported.
      if (typeof monthDay === "number" && monthDay >= 1 && monthDay <= 31) {
        return { frequency: "monthly", weekdays: [], monthDay, until };
      }
      return { frequency: "unsupported", weekdays: [] };
    }
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
      return { frequency: "weekly", weekdays, until };
    }
    // Parsed cleanly but isn't daily/weekly — e.g. monthly or yearly.
    return { frequency: "unsupported", weekdays: [] };
  } catch {
    // Not parseable at all. Treated as unsupported rather than "none" for the
    // same reason: saving must not quietly drop the rule.
    return { frequency: "unsupported", weekdays: [] };
  }
}

/**
 * Return `rruleString` with its end date replaced by `untilDateKey`.
 *
 * Textual rather than parse-and-rebuild so it preserves rules this module
 * can't model (monthly-by-ordinal, BYSETPOS): splitting a series must never
 * silently rewrite the half being kept.
 */
export function withUntil(rruleString: string, untilDateKey: string): string {
  const parts = rruleString
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^UNTIL=/i.test(p));
  parts.push(`UNTIL=${untilStamp(untilDateKey)}`);
  return parts.join(";");
}

/** Human summary for display, e.g. "Every Mon, Wed, Fri". */
export function describeRecurrence(state: RecurrenceState): string {
  const suffix = state.until ? ` until ${state.until}` : "";
  if (state.frequency === "none") return "Does not repeat";
  if (state.frequency === "unsupported") return "Custom repeat";
  if (state.frequency === "daily") return `Every day${suffix}`;
  if (state.frequency === "monthly") {
    return `Monthly on day ${state.monthDay ?? 1}${suffix}`;
  }
  if (state.weekdays.length === 0) return `Weekly${suffix}`;
  if (state.weekdays.length === 7) return `Every day${suffix}`;
  const labels = state.weekdays
    .slice()
    .sort((a, b) => a - b)
    .map((i) => WEEKDAYS[i]);
  return `Every ${labels.join(", ")}${suffix}`;
}
