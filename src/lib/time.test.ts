import { describe, it, expect } from "vitest";
import {
  timeToMinutes,
  minutesToTime,
  formatTime12,
  intervalsOverlap,
  addDaysKey,
  dateRangeKeys,
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
