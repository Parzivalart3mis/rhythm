import { describe, it, expect } from "vitest";
import {
  findConflictsForInterval,
  findConflictsForBlock,
} from "./conflict-check";
import type { ExpandInput, Occurrence } from "./expand-occurrences";

function occ(partial: Partial<Occurrence>): Occurrence {
  return {
    blockId: "x",
    categoryId: "c",
    title: "Block",
    notes: null,
    blockType: "fixed_time",
    date: "2026-01-05",
    startTime: "09:00",
    endTime: "10:00",
    reminderLeadMinutes: 10,
    isRecurring: false,
    isException: false,
    ...partial,
  };
}

describe("findConflictsForInterval", () => {
  it("flags an overlapping block on the same day", () => {
    const existing = [occ({ blockId: "a", title: "A", startTime: "09:30", endTime: "10:30" })];
    const hits = findConflictsForInterval(existing, "2026-01-05", "09:00", "10:00");
    expect(hits).toHaveLength(1);
    expect(hits[0].blockId).toBe("a");
  });

  it("treats touching edges as non-overlapping", () => {
    const existing = [occ({ blockId: "a", startTime: "10:00", endTime: "11:00" })];
    const hits = findConflictsForInterval(existing, "2026-01-05", "09:00", "10:00");
    expect(hits).toHaveLength(0);
  });

  it("ignores other days", () => {
    const existing = [occ({ blockId: "a", date: "2026-01-06" })];
    const hits = findConflictsForInterval(existing, "2026-01-05", "09:00", "10:00");
    expect(hits).toHaveLength(0);
  });

  it("ignores flexible tasks (null times)", () => {
    const existing = [occ({ blockId: "a", startTime: null, endTime: null })];
    const hits = findConflictsForInterval(existing, "2026-01-05", "09:00", "10:00");
    expect(hits).toHaveLength(0);
  });

  it("respects excludeBlockId", () => {
    const existing = [occ({ blockId: "self", startTime: "09:00", endTime: "10:00" })];
    const hits = findConflictsForInterval(existing, "2026-01-05", "09:00", "10:00", "self");
    expect(hits).toHaveLength(0);
  });
});

describe("findConflictsForBlock", () => {
  const existingBlock: ExpandInput = {
    block: {
      id: "existing",
      categoryId: "c",
      title: "Gym",
      notes: null,
      blockType: "fixed_time",
      startTime: "09:30",
      endTime: "10:30",
      taskDate: null,
      isRecurring: true,
      rruleString: "FREQ=WEEKLY;BYDAY=MO",
      seriesStartDate: "2026-01-05",
      reminderLeadMinutes: 10,
    },
    exceptions: [],
  };

  it("detects a recurring-vs-recurring overlap and de-dupes to one hit", () => {
    const candidate: ExpandInput = {
      block: {
        id: "__candidate__",
        categoryId: "c",
        title: "Class",
        notes: null,
        blockType: "fixed_time",
        startTime: "09:00",
        endTime: "10:00",
        taskDate: null,
        isRecurring: true,
        rruleString: "FREQ=WEEKLY;BYDAY=MO",
        seriesStartDate: "2026-01-05",
        reminderLeadMinutes: 10,
      },
      exceptions: [],
    };
    const hits = findConflictsForBlock(candidate, [existingBlock], "2026-01-05", "2026-03-01");
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Gym");
  });

  it("reports no conflict when times do not overlap", () => {
    const candidate: ExpandInput = {
      block: {
        id: "__candidate__",
        categoryId: "c",
        title: "Class",
        notes: null,
        blockType: "fixed_time",
        startTime: "11:00",
        endTime: "12:00",
        taskDate: null,
        isRecurring: true,
        rruleString: "FREQ=WEEKLY;BYDAY=MO",
        seriesStartDate: "2026-01-05",
        reminderLeadMinutes: 10,
      },
      exceptions: [],
    };
    const hits = findConflictsForBlock(candidate, [existingBlock], "2026-01-05", "2026-03-01");
    expect(hits).toHaveLength(0);
  });
});
