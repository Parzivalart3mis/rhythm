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
  it("flags a monthly rule as unsupported rather than 'none'", () => {
    expect(parseRecurrenceState("FREQ=MONTHLY;BYMONTHDAY=1").frequency).toBe(
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
