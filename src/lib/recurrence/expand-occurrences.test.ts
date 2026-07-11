import { describe, it, expect } from "vitest";
import {
  expandBlock,
  expandOccurrences,
  type ExpandInput,
  type ExpandableBlock,
} from "./expand-occurrences";

// 2026-01-05 is a Monday; 07 Wed, 09 Fri, 12 next Mon.
const baseRecurring: ExpandableBlock = {
  id: "b1",
  categoryId: "c1",
  title: "Lecture",
  notes: null,
  blockType: "fixed_time",
  startTime: "09:00",
  endTime: "10:15",
  taskDate: null,
  isRecurring: true,
  rruleString: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
  seriesStartDate: "2026-01-05",
  reminderLeadMinutes: 10,
};

describe("expandBlock — recurring", () => {
  it("expands weekly MO/WE/FR within a week", () => {
    const occ = expandBlock({ block: baseRecurring, exceptions: [] }, "2026-01-05", "2026-01-11");
    expect(occ.map((o) => o.date)).toEqual(["2026-01-05", "2026-01-07", "2026-01-09"]);
    expect(occ[0].startTime).toBe("09:00");
    expect(occ[0].endTime).toBe("10:15");
    expect(occ[0].isRecurring).toBe(true);
  });

  it("does not produce occurrences before the series start", () => {
    const occ = expandBlock({ block: baseRecurring, exceptions: [] }, "2026-01-01", "2026-01-04");
    expect(occ).toHaveLength(0);
  });

  it("skips an occurrence with a skip exception", () => {
    const occ = expandBlock(
      {
        block: baseRecurring,
        exceptions: [
          {
            occurrenceDate: "2026-01-07",
            exceptionType: "skip",
            newStartTime: null,
            newEndTime: null,
            newDate: null,
          },
        ],
      },
      "2026-01-05",
      "2026-01-11"
    );
    expect(occ.map((o) => o.date)).toEqual(["2026-01-05", "2026-01-09"]);
  });

  it("reschedules an occurrence's time in place", () => {
    const occ = expandBlock(
      {
        block: baseRecurring,
        exceptions: [
          {
            occurrenceDate: "2026-01-07",
            exceptionType: "reschedule",
            newStartTime: "11:00",
            newEndTime: "12:00",
            newDate: null,
          },
        ],
      },
      "2026-01-05",
      "2026-01-11"
    );
    const wed = occ.find((o) => o.date === "2026-01-07")!;
    expect(wed.startTime).toBe("11:00");
    expect(wed.endTime).toBe("12:00");
    expect(wed.isException).toBe(true);
  });

  it("moves an occurrence to a different in-range date", () => {
    const occ = expandBlock(
      {
        block: baseRecurring,
        exceptions: [
          {
            occurrenceDate: "2026-01-07",
            exceptionType: "reschedule",
            newStartTime: null,
            newEndTime: null,
            newDate: "2026-01-08",
          },
        ],
      },
      "2026-01-05",
      "2026-01-11"
    );
    const dates = occ.map((o) => o.date).sort();
    expect(dates).toContain("2026-01-08");
    expect(dates).not.toContain("2026-01-07");
  });

  it("captures an occurrence rescheduled INTO the range from outside", () => {
    // Original Fri 2026-01-09 moved to 2026-01-12, viewing next week.
    const occ = expandBlock(
      {
        block: baseRecurring,
        exceptions: [
          {
            occurrenceDate: "2026-01-09",
            exceptionType: "reschedule",
            newStartTime: null,
            newEndTime: null,
            newDate: "2026-01-12",
          },
        ],
      },
      "2026-01-12",
      "2026-01-18"
    );
    expect(occ.some((o) => o.date === "2026-01-12")).toBe(true);
  });

  it("drops an occurrence rescheduled OUT of the range", () => {
    const occ = expandBlock(
      {
        block: baseRecurring,
        exceptions: [
          {
            occurrenceDate: "2026-01-05",
            exceptionType: "reschedule",
            newStartTime: null,
            newEndTime: null,
            newDate: "2026-01-20",
          },
        ],
      },
      "2026-01-05",
      "2026-01-11"
    );
    expect(occ.some((o) => o.date === "2026-01-05")).toBe(false);
  });
});

describe("expandBlock — non-recurring & flexible", () => {
  const oneOff: ExpandableBlock = {
    ...baseRecurring,
    id: "b2",
    isRecurring: false,
    rruleString: null,
    seriesStartDate: null,
    taskDate: "2026-01-06",
  };

  it("emits a single occurrence on taskDate", () => {
    const occ = expandBlock({ block: oneOff, exceptions: [] }, "2026-01-05", "2026-01-11");
    expect(occ).toHaveLength(1);
    expect(occ[0].date).toBe("2026-01-06");
  });

  it("emits nothing when taskDate is out of range", () => {
    const occ = expandBlock({ block: oneOff, exceptions: [] }, "2026-02-01", "2026-02-07");
    expect(occ).toHaveLength(0);
  });

  it("flexible task carries null times", () => {
    const task: ExpandableBlock = {
      ...oneOff,
      id: "b3",
      blockType: "flexible_task",
      startTime: null,
      endTime: null,
    };
    const occ = expandBlock({ block: task, exceptions: [] }, "2026-01-05", "2026-01-11");
    expect(occ[0].startTime).toBeNull();
    expect(occ[0].blockType).toBe("flexible_task");
  });
});

describe("expandOccurrences — sorting", () => {
  it("sorts by date then time, flexible tasks before timed", () => {
    const timed: ExpandInput = { block: baseRecurring, exceptions: [] };
    const task: ExpandInput = {
      block: {
        ...baseRecurring,
        id: "t1",
        blockType: "flexible_task",
        startTime: null,
        endTime: null,
        isRecurring: false,
        rruleString: null,
        seriesStartDate: null,
        taskDate: "2026-01-05",
      },
      exceptions: [],
    };
    const occ = expandOccurrences([timed, task], "2026-01-05", "2026-01-05");
    expect(occ[0].blockType).toBe("flexible_task");
    expect(occ[1].startTime).toBe("09:00");
  });

  it("returns nothing for a malformed rrule instead of throwing", () => {
    const bad: ExpandInput = {
      block: { ...baseRecurring, rruleString: "NOT A RULE" },
      exceptions: [],
    };
    expect(() => expandBlock(bad, "2026-01-05", "2026-01-11")).not.toThrow();
  });
});
