// Default categories seeded for every new user on first login.
export const DEFAULT_CATEGORIES = [
  { name: "Class", colorHex: "#4C5FD5" },
  { name: "Work", colorHex: "#0EA5A0" },
  { name: "Gym", colorHex: "#F2994A" },
  { name: "Personal", colorHex: "#9B6FD6" },
] as const;

// Swatch options offered in the category color picker.
export const CATEGORY_COLORS = [
  "#4C5FD5", // Class blue
  "#0EA5A0", // Work teal
  "#F2994A", // Gym orange
  "#9B6FD6", // Personal purple
  "#DC2626", // Red
  "#22C55E", // Green
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#0EA5E9", // Sky
  "#8B5CF6", // Violet
  "#14B8A6", // Teal
  "#64748B", // Slate
] as const;

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
// rrule BYDAY codes indexed to match WEEKDAYS above (Mon-first).
export const RRULE_WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export const REMINDER_LEAD_OPTIONS = [0, 5, 10, 15, 30, 60] as const;
export const DEFAULT_REMINDER_LEAD_MINUTES = 10;

// Rolling window (days) used when expanding recurring occurrences for conflict
// detection at write time.
export const CONFLICT_WINDOW_DAYS = 60;

// ---- Reminder dispatch ----

// The external scheduler fires on the minute but not to the second, and its
// clock is not ours. Treat a reminder as due slightly before its exact instant
// so a run that lands a few seconds early still delivers.
export const REMINDER_EARLY_TOLERANCE_MS = 30_000;

// How long after the reminder instant a delivery is still worth making — this
// is what lets a 0-minute lead ("starting now") fire at all, and lets a missed
// run be caught up by the next one.
export const REMINDER_LATE_GRACE_MS = 5 * 60_000;

// ---- Reminder schedule planning ----

// How far ahead the planner expands the timetable when deriving firing times.
// Must exceed 7 so a weekly series always contributes a time even on the day it
// occurs, which keeps the plan stable instead of churning once per day.
export const SCHEDULE_LOOKAHEAD_DAYS = 8;

// Extra UTC hours always included so the endpoint keeps running (and therefore
// keeps re-checking its own schedule) even when the timetable is empty.
export const HEARTBEAT_UTC_HOURS = [2, 10, 18];

// Minute used for the heartbeat when the timetable contributes no times at all.
export const HEARTBEAT_FALLBACK_MINUTE = 11;

// After a failed sync, wait this long before spending more of the provider's
// daily API quota on a retry.
export const SYNC_FAILURE_BACKOFF_MS = 5 * 60_000;

// Reconcile at least this often even when nothing changed, so a job that was
// edited, disabled or deleted by hand in the provider's console gets repaired.
// Costs at most one API call per day against a 100/day quota.
export const SYNC_MAX_AGE_MS = 24 * 60 * 60_000;

// cron-job.org caps free-account executions at 30s (sustaining members get
// more). Asking for longer is rejected, so this is the ceiling we request.
export const CRONJOB_REQUEST_TIMEOUT_SECONDS = 30;
