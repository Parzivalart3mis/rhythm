import { describe, expect, it } from "vitest";
import {
  buildSchedulePlan,
  collectReminderTimes,
  fingerprintOf,
  type PlanUser,
} from "./schedule-plan";
import type { ExpandInput } from "@/lib/recurrence/expand-occurrences";
import { HEARTBEAT_UTC_HOURS } from "@/lib/constants";

function timed(
  overrides: Partial<ExpandInput["block"]> = {}
): ExpandInput {
  return {
    block: {
      id: overrides.id ?? "block-1",
      categoryId: "cat-1",
      title: "Class",
      notes: null,
      blockType: "fixed_time",
      startTime: "09:00",
      endTime: "10:00",
      taskDate: null,
      isRecurring: false,
      rruleString: null,
      seriesStartDate: null,
      reminderLeadMinutes: 10,
      ...overrides,
    },
    exceptions: [],
  };
}

function user(timezone: string, ...inputs: ExpandInput[]): PlanUser {
  return { timezone, inputs };
}

// 2026-08-08 is a Saturday; CDT (UTC-5) is in effect in America/Chicago.
const NOW = new Date("2026-08-08T12:00:00Z");

describe("collectReminderTimes", () => {
  it("converts a local start minus its lead into a UTC firing time", () => {
    const block = timed({ taskDate: "2026-08-10", startTime: "09:00" });
    const times = collectReminderTimes([user("America/Chicago", block)], NOW);
    // 09:00 CDT = 14:00 UTC, minus a 10-minute lead.
    expect(times).toEqual(["13:50"]);
  });

  it("honours a zero-minute lead", () => {
    const block = timed({
      taskDate: "2026-08-10",
      startTime: "09:00",
      reminderLeadMinutes: 0,
    });
    expect(collectReminderTimes([user("America/Chicago", block)], NOW)).toEqual([
      "14:00",
    ]);
  });

  it("rolls back across midnight when the lead crosses the day boundary", () => {
    const block = timed({
      taskDate: "2026-08-10",
      startTime: "00:10",
      reminderLeadMinutes: 30,
    });
    // 00:10 UTC minus 30 min lands on the previous day at 23:40.
    expect(collectReminderTimes([user("UTC", block)], NOW)).toEqual(["23:40"]);
  });

  it("ignores flexible tasks, which have no start instant", () => {
    const flexible = timed({
      blockType: "flexible_task",
      startTime: null,
      endTime: null,
      taskDate: "2026-08-10",
    });
    expect(collectReminderTimes([user("UTC", flexible)], NOW)).toEqual([]);
  });

  it("merges duplicate instants and sorts the result", () => {
    const morning = timed({ id: "a", taskDate: "2026-08-10", startTime: "09:00" });
    const alsoMorning = timed({ id: "b", taskDate: "2026-08-11", startTime: "09:00" });
    const evening = timed({ id: "c", taskDate: "2026-08-10", startTime: "18:30" });
    const times = collectReminderTimes(
      [user("UTC", morning, alsoMorning, evening)],
      NOW
    );
    expect(times).toEqual(["08:50", "18:20"]);
  });

  it("keeps a weekly series in the plan on the day it occurs", () => {
    // Saturday series, and NOW is a Saturday: today's occurrence is already past
    // by 12:00Z, but next Saturday falls inside the 8-day lookahead.
    const weekly = timed({
      isRecurring: true,
      taskDate: null,
      startTime: "09:00",
      rruleString: "FREQ=WEEKLY;BYDAY=SA",
      seriesStartDate: "2026-08-01",
    });
    expect(collectReminderTimes([user("UTC", weekly)], NOW)).toEqual(["08:50"]);
  });

  it("covers both sides of a DST transition inside the lookahead", () => {
    // America/Chicago leaves DST on 2026-11-01: 08:00 local is 13:00 UTC before
    // and 14:00 UTC after, and a daily series spans both.
    const daily = timed({
      isRecurring: true,
      taskDate: null,
      startTime: "08:00",
      reminderLeadMinutes: 0,
      rruleString: "FREQ=DAILY",
      seriesStartDate: "2026-10-01",
    });
    const times = collectReminderTimes(
      [user("America/Chicago", daily)],
      new Date("2026-10-29T12:00:00Z")
    );
    expect(times).toEqual(["13:00", "14:00"]);
  });

  it("normalises users in different zones onto the same UTC clock", () => {
    const chicago = timed({ id: "a", taskDate: "2026-08-10", startTime: "09:00" });
    const london = timed({ id: "b", taskDate: "2026-08-10", startTime: "15:00" });
    const times = collectReminderTimes(
      [user("America/Chicago", chicago), user("Europe/London", london)],
      NOW
    );
    // 09:00 CDT → 13:50Z, 15:00 BST → 13:50Z: the same instant, deduplicated.
    expect(times).toEqual(["13:50"]);
  });

  it("falls back to UTC for an unusable timezone instead of throwing", () => {
    const block = timed({ taskDate: "2026-08-10", startTime: "09:00" });
    expect(collectReminderTimes([user("Not/AZone", block)], NOW)).toEqual([]);
  });

  it("skips occurrences beyond the lookahead window", () => {
    const block = timed({ taskDate: "2026-09-30", startTime: "09:00" });
    expect(collectReminderTimes([user("UTC", block)], NOW)).toEqual([]);
  });
});

describe("buildSchedulePlan", () => {
  it("reduces firing times to hour and minute axes plus a heartbeat", () => {
    const morning = timed({ id: "a", taskDate: "2026-08-10", startTime: "09:00" });
    const evening = timed({ id: "b", taskDate: "2026-08-10", startTime: "18:30" });
    const plan = buildSchedulePlan([user("UTC", morning, evening)], NOW);

    expect(plan.reminderTimes).toEqual(["08:50", "18:20"]);
    expect(plan.schedule.hours).toEqual([2, 8, 10, 18].sort((a, b) => a - b));
    expect(plan.schedule.minutes).toEqual([20, 50]);
    expect(plan.schedule.timezone).toBe("UTC");
    expect(plan.schedule.mdays).toEqual([-1]);
    expect(plan.schedule.months).toEqual([-1]);
    expect(plan.schedule.wdays).toEqual([-1]);
  });

  it("always fires at a superset of the exact reminder instants", () => {
    const blocks = [
      timed({ id: "a", taskDate: "2026-08-09", startTime: "07:15" }),
      timed({ id: "b", taskDate: "2026-08-10", startTime: "12:40" }),
      timed({ id: "c", taskDate: "2026-08-11", startTime: "21:05" }),
    ];
    const plan = buildSchedulePlan([user("Asia/Kolkata", ...blocks)], NOW);

    for (const time of plan.reminderTimes) {
      const [hour, minute] = time.split(":").map(Number);
      expect(plan.schedule.hours).toContain(hour);
      expect(plan.schedule.minutes).toContain(minute);
    }
  });

  it("reuses an existing minute for the heartbeat so the cross product stays tight", () => {
    const block = timed({ taskDate: "2026-08-10", startTime: "09:00" });
    const plan = buildSchedulePlan([user("UTC", block)], NOW);

    expect(plan.schedule.minutes).toEqual([50]);
    for (const hour of HEARTBEAT_UTC_HOURS) {
      expect(plan.schedule.hours).toContain(hour);
    }
    expect(plan.firingsPerDay).toBe(plan.schedule.hours.length);
  });

  it("still schedules a heartbeat when the timetable is empty", () => {
    const plan = buildSchedulePlan([], NOW);
    expect(plan.reminderTimes).toEqual([]);
    expect(plan.schedule.hours).toEqual([...HEARTBEAT_UTC_HOURS]);
    expect(plan.schedule.minutes).toEqual([11]);
  });

  it("stays byte-identical when the timetable has not changed", () => {
    const block = timed({
      isRecurring: true,
      taskDate: null,
      startTime: "09:00",
      rruleString: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
      seriesStartDate: "2026-08-03",
    });
    const monday = buildSchedulePlan(
      [user("America/Chicago", block)],
      new Date("2026-08-10T12:00:00Z")
    );
    const thursday = buildSchedulePlan(
      [user("America/Chicago", block)],
      new Date("2026-08-13T12:00:00Z")
    );
    // Same weekly timetable read on different days ⇒ no pointless API write.
    expect(thursday.fingerprint).toBe(monday.fingerprint);
  });

  it("changes fingerprint when a block moves", () => {
    const before = buildSchedulePlan(
      [user("UTC", timed({ taskDate: "2026-08-10", startTime: "09:00" }))],
      NOW
    );
    const after = buildSchedulePlan(
      [user("UTC", timed({ taskDate: "2026-08-10", startTime: "09:30" }))],
      NOW
    );
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it("changes fingerprint when only the reminder lead changes", () => {
    const before = buildSchedulePlan(
      [user("UTC", timed({ taskDate: "2026-08-10", reminderLeadMinutes: 10 }))],
      NOW
    );
    const after = buildSchedulePlan(
      [user("UTC", timed({ taskDate: "2026-08-10", reminderLeadMinutes: 30 }))],
      NOW
    );
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it("changes fingerprint when the user's timezone changes", () => {
    const block = timed({ taskDate: "2026-08-10", startTime: "09:00" });
    const chicago = buildSchedulePlan([user("America/Chicago", block)], NOW);
    const kolkata = buildSchedulePlan([user("Asia/Kolkata", block)], NOW);
    expect(kolkata.fingerprint).not.toBe(chicago.fingerprint);
  });

  it("drops a cancelled occurrence's firing time", () => {
    const cancelled: ExpandInput = {
      ...timed({ taskDate: "2026-08-10", startTime: "09:00" }),
      exceptions: [
        {
          occurrenceDate: "2026-08-10",
          exceptionType: "skip",
          newStartTime: null,
          newEndTime: null,
          newDate: null,
        },
      ],
    };
    expect(buildSchedulePlan([user("UTC", cancelled)], NOW).reminderTimes).toEqual(
      []
    );
  });

  it("follows a rescheduled occurrence to its new time", () => {
    const moved: ExpandInput = {
      ...timed({ taskDate: "2026-08-10", startTime: "09:00" }),
      exceptions: [
        {
          occurrenceDate: "2026-08-10",
          exceptionType: "reschedule",
          newStartTime: "16:45",
          newEndTime: "17:45",
          newDate: null,
        },
      ],
    };
    expect(buildSchedulePlan([user("UTC", moved)], NOW).reminderTimes).toEqual([
      "16:35",
    ]);
  });

  it("keeps the series time when only one occurrence of it is rescheduled", () => {
    // Two Sundays fall inside the lookahead, so moving one still leaves the
    // other's 09:00 slot — the plan must cover both.
    const weekly: ExpandInput = {
      ...timed({
        isRecurring: true,
        taskDate: null,
        startTime: "09:00",
        rruleString: "FREQ=WEEKLY;BYDAY=SU",
        seriesStartDate: "2026-08-02",
      }),
      exceptions: [
        {
          occurrenceDate: "2026-08-09",
          exceptionType: "reschedule",
          newStartTime: "16:45",
          newEndTime: "17:45",
          newDate: null,
        },
      ],
    };
    expect(buildSchedulePlan([user("UTC", weekly)], NOW).reminderTimes).toEqual([
      "08:50",
      "16:35",
    ]);
  });

  it("keeps the firing count far below a blanket every-minute job", () => {
    const blocks = [
      timed({ id: "a", taskDate: "2026-08-09", startTime: "08:00" }),
      timed({ id: "b", taskDate: "2026-08-10", startTime: "12:00" }),
      timed({ id: "c", taskDate: "2026-08-11", startTime: "13:30" }),
      timed({ id: "d", taskDate: "2026-08-12", startTime: "17:00" }),
    ];
    const plan = buildSchedulePlan([user("UTC", ...blocks)], NOW);
    expect(plan.firingsPerDay).toBeLessThan(100);
  });
});

describe("fingerprintOf", () => {
  it("is stable for equal values and differs for unequal ones", () => {
    expect(fingerprintOf({ a: 1 })).toBe(fingerprintOf({ a: 1 }));
    expect(fingerprintOf({ a: 1 })).not.toBe(fingerprintOf({ a: 2 }));
  });
});
