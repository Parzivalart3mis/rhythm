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

describe("unsupported rules round-trip untouched", () => {
  // Opening a block in the editor and saving it must never silently rewrite a
  // rule the editor can't represent — that would turn a live series into a
  // single one-off block.
  it("flags an ordinal monthly rule as unsupported", () => {
    // "first Monday of the month" — monthly, but not a plain day-of-month, so
    // the editor still can't represent it.
    expect(parseRecurrenceState("FREQ=MONTHLY;BYDAY=1MO").frequency).toBe(
      "unsupported"
    );
  });

  it("flags a yearly rule as unsupported", () => {
    expect(parseRecurrenceState("FREQ=YEARLY").frequency).toBe("unsupported");
  });

  it("flags an unparseable rule as unsupported", () => {
    expect(parseRecurrenceState("TOTAL NONSENSE").frequency).toBe("unsupported");
  });

  it("still reports a genuinely absent rule as 'none'", () => {
    expect(parseRecurrenceState(null).frequency).toBe("none");
  });

  it("refuses to synthesise a string for an unsupported rule", () => {
    // null forces the caller to send the block's original rruleString back.
    expect(
      buildRruleString({ frequency: "unsupported", weekdays: [] })
    ).toBeNull();
  });

  it("describes it without pretending it doesn't repeat", () => {
    expect(describeRecurrence({ frequency: "unsupported", weekdays: [] })).toBe(
      "Custom repeat"
    );
  });
});

describe("monthly and end dates", () => {
  it("round-trips a plain day-of-month rule", () => {
    const built = buildRruleString({
      frequency: "monthly",
      weekdays: [],
      monthDay: 15,
    });
    expect(built).toBe("FREQ=MONTHLY;BYMONTHDAY=15");
    const parsed = parseRecurrenceState(built);
    expect(parsed.frequency).toBe("monthly");
    expect(parsed.monthDay).toBe(15);
    expect(parsed.until).toBeNull();
  });

  it("round-trips an end date on a weekly rule", () => {
    const built = buildRruleString({
      frequency: "weekly",
      weekdays: [0, 2],
      until: "2026-12-18",
    });
    expect(built).toBe("FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261218T235959Z");
    const parsed = parseRecurrenceState(built);
    expect(parsed.frequency).toBe("weekly");
    expect(parsed.weekdays).toEqual([0, 2]);
    expect(parsed.until).toBe("2026-12-18");
  });

  it("round-trips an end date on daily and monthly rules", () => {
    for (const state of [
      { frequency: "daily" as const, weekdays: [], until: "2027-01-31" },
      {
        frequency: "monthly" as const,
        weekdays: [],
        monthDay: 3,
        until: "2027-01-31",
      },
    ]) {
      const parsed = parseRecurrenceState(buildRruleString(state));
      expect(parsed.frequency).toBe(state.frequency);
      expect(parsed.until).toBe("2027-01-31");
    }
  });

  it("includes the final day — UNTIL lands at end of day", () => {
    const built = buildRruleString({
      frequency: "daily",
      weekdays: [],
      until: "2026-12-18",
    });
    expect(built).toContain("T235959Z");
  });

  it("omits UNTIL when the series never ends", () => {
    expect(
      buildRruleString({ frequency: "daily", weekdays: [], until: null })
    ).toBe("FREQ=DAILY");
    expect(buildRruleString({ frequency: "daily", weekdays: [] })).toBe(
      "FREQ=DAILY"
    );
  });

  it("stops expanding after the end date", async () => {
    const { expandBlock } = await import("./expand-occurrences");
    const occ = expandBlock(
      {
        block: {
          id: "b1",
          categoryId: "c1",
          title: "Ends soon",
          notes: null,
          blockType: "fixed_time",
          startTime: "09:00",
          endTime: "10:00",
          taskDate: null,
          isRecurring: true,
          rruleString: "FREQ=DAILY;UNTIL=20260110T235959Z",
          seriesStartDate: "2026-01-05",
          reminderLeadMinutes: 10,
        },
        exceptions: [],
      },
      "2026-01-05",
      "2026-01-20"
    );
    expect(occ.map((o) => o.date)).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-10",
    ]);
  });
});
