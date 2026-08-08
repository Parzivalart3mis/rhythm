import { describe, it, expect } from "vitest";
import {
  addDaysKey,
  dateRangeKeys,
  formatTime12,
  intervalsOverlap,
  minutesToTime,
  timeToMinutes,
  zonedNow,
} from "./time";

describe("time helpers", () => {
  it("converts time to/from minutes", () => {
    expect(timeToMinutes("06:45")).toBe(405);
    expect(minutesToTime(405)).toBe("06:45");
  });

  it("formats 12-hour labels", () => {
    expect(formatTime12("18:45")).toBe("6:45pm");
    expect(formatTime12("09:00")).toBe("9am");
    expect(formatTime12("00:00")).toBe("12am");
    expect(formatTime12("12:00")).toBe("12pm");
  });

  it("detects interval overlap with exclusive edges", () => {
    expect(intervalsOverlap(540, 600, 570, 630)).toBe(true);
    expect(intervalsOverlap(540, 600, 600, 660)).toBe(false);
  });

  it("adds days across month boundaries", () => {
    expect(addDaysKey("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysKey("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("builds an inclusive date range", () => {
    expect(dateRangeKeys("2026-01-05", "2026-01-07")).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ]);
    expect(dateRangeKeys("2026-01-07", "2026-01-05")).toEqual([]);
  });
});

describe("zonedNow", () => {
  // 2026-08-08T02:30:00Z — still Aug 7 in Chicago (UTC-5 in summer).
  const instant = new Date("2026-08-08T02:30:00Z");

  it("reports the local date and minutes for a zone behind UTC", () => {
    expect(zonedNow(instant, "America/Chicago")).toEqual({
      dateKey: "2026-08-07",
      minutes: 21 * 60 + 30,
    });
  });

  it("reports the local date and minutes for a zone ahead of UTC", () => {
    expect(zonedNow(instant, "Asia/Kolkata")).toEqual({
      dateKey: "2026-08-08",
      minutes: 8 * 60,
    });
  });

  it("agrees with UTC when asked for UTC", () => {
    expect(zonedNow(instant, "UTC")).toEqual({
      dateKey: "2026-08-08",
      minutes: 2 * 60 + 30,
    });
  });

  it("treats local midnight as minute 0, not 1440", () => {
    // 2026-08-08T05:00:00Z is exactly midnight in Chicago.
    const midnight = new Date("2026-08-08T05:00:00Z");
    expect(zonedNow(midnight, "America/Chicago")).toEqual({
      dateKey: "2026-08-08",
      minutes: 0,
    });
  });

  it("falls back to the device zone instead of throwing on a bad zone", () => {
    const out = zonedNow(instant, "Not/AZone");
    expect(out.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.minutes).toBeGreaterThanOrEqual(0);
    expect(out.minutes).toBeLessThan(1440);
  });
});
