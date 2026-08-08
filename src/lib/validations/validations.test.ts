import { describe, it, expect } from "vitest";
import { blockInput, occurrenceEdit, checkConflictsInput } from "./index";

// blockInput is the only guard between the client and schedule_blocks — the
// editor's own validate() checks fewer conditions, so nothing else catches a
// malformed write.

const VALID_UUID = "11111111-2222-4333-8444-555555555555";

function base(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: VALID_UUID,
    title: "Gym",
    blockType: "fixed_time",
    startTime: "09:00",
    endTime: "10:00",
    taskDate: "2026-08-08",
    isRecurring: false,
    reminderLeadMinutes: 10,
    ...overrides,
  };
}

/** The first issue's message, or null when the input parsed. */
function reject(input: unknown): string | null {
  const result = blockInput.safeParse(input);
  return result.success ? null : result.error.issues[0].message;
}

describe("blockInput — accepts", () => {
  it("a one-off fixed-time block", () => {
    expect(reject(base())).toBeNull();
  });

  it("a recurring block with a rule and an anchor", () => {
    expect(
      reject(
        base({
          isRecurring: true,
          taskDate: undefined,
          rruleString: "FREQ=WEEKLY;BYDAY=MO",
          seriesStartDate: "2026-08-03",
        })
      )
    ).toBeNull();
  });

  it("a flexible task with no times", () => {
    expect(
      reject(
        base({ blockType: "flexible_task", startTime: undefined, endTime: undefined })
      )
    ).toBeNull();
  });

  it("defaults the reminder lead when omitted", () => {
    const parsed = blockInput.parse(base({ reminderLeadMinutes: undefined }));
    expect(parsed.reminderLeadMinutes).toBe(10);
  });
});

describe("blockInput — rejects", () => {
  it("a fixed-time block missing its end time", () => {
    expect(reject(base({ endTime: undefined }))).toMatch(/start and end/i);
  });

  it("a fixed-time block missing its start time", () => {
    expect(reject(base({ startTime: undefined }))).toMatch(/start and end/i);
  });

  it("an end time before the start time", () => {
    expect(reject(base({ startTime: "10:00", endTime: "09:00" }))).toMatch(
      /after start/i
    );
  });

  it("an end time equal to the start time", () => {
    expect(reject(base({ startTime: "09:00", endTime: "09:00" }))).toMatch(
      /after start/i
    );
  });

  it("a recurring block with no rule", () => {
    expect(
      reject(
        base({ isRecurring: true, taskDate: undefined, seriesStartDate: "2026-08-03" })
      )
    ).toMatch(/recurrence rule/i);
  });

  it("a recurring block with no anchor date", () => {
    expect(
      reject(
        base({
          isRecurring: true,
          taskDate: undefined,
          rruleString: "FREQ=DAILY",
        })
      )
    ).toMatch(/start date/i);
  });

  it("a non-recurring block with no date", () => {
    expect(reject(base({ taskDate: undefined }))).toMatch(/need a date/i);
  });

  it("a title that is empty or too long", () => {
    expect(reject(base({ title: "" }))).toBeTruthy();
    expect(reject(base({ title: "x".repeat(101) }))).toBeTruthy();
  });

  it("a category id that isn't a uuid", () => {
    expect(reject(base({ categoryId: "not-a-uuid" }))).toBeTruthy();
  });

  it("malformed times and dates", () => {
    expect(reject(base({ startTime: "9:00" }))).toBeTruthy();
    expect(reject(base({ taskDate: "08-08-2026" }))).toBeTruthy();
  });

  it("a reminder lead outside 0..1440", () => {
    expect(reject(base({ reminderLeadMinutes: -1 }))).toBeTruthy();
    expect(reject(base({ reminderLeadMinutes: 1441 }))).toBeTruthy();
    expect(reject(base({ reminderLeadMinutes: 10.5 }))).toBeTruthy();
  });
});

describe("occurrenceEdit", () => {
  it("accepts a skip", () => {
    expect(
      occurrenceEdit.safeParse({
        occurrenceDate: "2026-08-08",
        exceptionType: "skip",
      }).success
    ).toBe(true);
  });

  it("accepts a reschedule with a new time", () => {
    expect(
      occurrenceEdit.safeParse({
        occurrenceDate: "2026-08-08",
        exceptionType: "reschedule",
        newStartTime: "16:45",
        newEndTime: "17:45",
      }).success
    ).toBe(true);
  });

  it("rejects a reschedule ending before it starts", () => {
    const r = occurrenceEdit.safeParse({
      occurrenceDate: "2026-08-08",
      exceptionType: "reschedule",
      newStartTime: "17:45",
      newEndTime: "16:45",
    });
    expect(r.success).toBe(false);
  });
});

describe("checkConflictsInput", () => {
  it("requires a date and both times", () => {
    expect(
      checkConflictsInput.safeParse({
        date: "2026-08-08",
        startTime: "09:00",
        endTime: "10:00",
      }).success
    ).toBe(true);
    expect(
      checkConflictsInput.safeParse({ date: "2026-08-08", startTime: "09:00" }).success
    ).toBe(false);
  });
});
