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
