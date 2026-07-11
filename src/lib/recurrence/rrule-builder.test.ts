import { describe, it, expect } from "vitest";
import {
  buildRruleString,
  parseRecurrenceState,
  describeRecurrence,
} from "./rrule-builder";

describe("rrule-builder", () => {
  it("builds a weekly-by-weekday rule", () => {
    expect(buildRruleString({ frequency: "weekly", weekdays: [0, 2, 4] })).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    );
  });

  it("builds a daily rule", () => {
    expect(buildRruleString({ frequency: "daily", weekdays: [] })).toBe("FREQ=DAILY");
  });

  it("returns null for no recurrence", () => {
    expect(buildRruleString({ frequency: "none", weekdays: [] })).toBeNull();
  });

  it("round-trips weekly state through parse", () => {
    const built = buildRruleString({ frequency: "weekly", weekdays: [0, 2, 4] })!;
    const parsed = parseRecurrenceState(built);
    expect(parsed.frequency).toBe("weekly");
    expect(parsed.weekdays.sort()).toEqual([0, 2, 4]);
  });

  it("parses null as no recurrence", () => {
    expect(parseRecurrenceState(null).frequency).toBe("none");
  });

  it("describes weekdays in human form", () => {
    expect(describeRecurrence({ frequency: "weekly", weekdays: [0, 2, 4] })).toBe(
      "Every Mon, Wed, Fri"
    );
    expect(describeRecurrence({ frequency: "daily", weekdays: [] })).toBe("Every day");
    expect(describeRecurrence({ frequency: "none", weekdays: [] })).toBe(
      "Does not repeat"
    );
  });
});
