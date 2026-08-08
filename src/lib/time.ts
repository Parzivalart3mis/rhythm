// Time + date helpers. All schedule logic works with "HH:MM" strings for
// time-of-day and "YYYY-MM-DD" strings for dates, avoiding timezone drift from
// Date objects until display formatting.

/** Convert "HH:MM" (or "HH:MM:SS") to minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight to "HH:MM". */
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Normalize a stored time value ("HH:MM:SS") to "HH:MM". */
export function normalizeTime(time: string): string {
  return time.slice(0, 5);
}

/** Format "HH:MM" as a human 12-hour label, e.g. "6:45pm". */
export function formatTime12(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

/** "YYYY-MM-DD" for a Date, using its local components. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" into a Date at local midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Where "now" falls in a given IANA zone: the local date key and minutes since
 * local midnight.
 *
 * The views used to read the device clock directly, which disagrees with the
 * schedule whenever the device's zone differs from the one reminders fire in.
 * Falls back to the device's own zone if `timeZone` is unusable, rather than
 * throwing inside a render.
 */
export function zonedNow(
  now: Date,
  timeZone: string
): { dateKey: string; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
  } catch {
    return {
      dateKey: toDateKey(now),
      minutes: now.getHours() * 60 + now.getMinutes(),
    };
  }
  const at = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  // hourCycle h23 still reports midnight as "24" in some environments.
  const hour = Number(at("hour")) % 24;
  return {
    dateKey: `${at("year")}-${at("month")}-${at("day")}`,
    minutes: hour * 60 + Number(at("minute")),
  };
}

/** Do two [start,end) minute intervals overlap? Touching edges do not overlap. */
export function intervalsOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** Add days to a "YYYY-MM-DD" key, returning a new key. */
export function addDaysKey(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Inclusive list of date keys from start to end. */
export function dateRangeKeys(startKey: string, endKey: string): string[] {
  const out: string[] = [];
  let cur = startKey;
  // Guard against inverted ranges.
  if (startKey > endKey) return out;
  while (cur <= endKey) {
    out.push(cur);
    cur = addDaysKey(cur, 1);
  }
  return out;
}
