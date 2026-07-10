import { RRule } from "rrule";
import { normalizeTime } from "@/lib/time";

// Occurrences are never stored as rows — they're computed at read time by
// expanding each block's rrule and overlaying its exceptions. Recurrence math is
// done entirely in UTC to avoid DST / local-timezone off-by-one drift; times of
// day are carried separately as "HH:MM" strings and never fed through Date math.

export type BlockType = "fixed_time" | "flexible_task";
export type ExceptionType = "skip" | "reschedule";

export interface ExpandableException {
  occurrenceDate: string; // YYYY-MM-DD, the original date
  exceptionType: ExceptionType;
  newStartTime: string | null;
  newEndTime: string | null;
  newDate: string | null;
}

export interface ExpandableBlock {
  id: string;
  categoryId: string;
  title: string;
  notes: string | null;
  blockType: BlockType;
  startTime: string | null;
  endTime: string | null;
  taskDate: string | null;
  isRecurring: boolean;
  rruleString: string | null;
  seriesStartDate: string | null;
  reminderLeadMinutes: number;
}

export interface ExpandInput {
  block: ExpandableBlock;
  exceptions: ExpandableException[];
}

export interface Occurrence {
  blockId: string;
  categoryId: string;
  title: string;
  notes: string | null;
  blockType: BlockType;
  date: string; // YYYY-MM-DD (final date, after any reschedule)
  startTime: string | null; // HH:MM, null for flexible tasks
  endTime: string | null;
  reminderLeadMinutes: number;
  isException: boolean; // this occurrence was rescheduled
}

function utcDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function keyFromUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeOccurrence(
  block: ExpandableBlock,
  date: string,
  startTime: string | null,
  endTime: string | null,
  isException: boolean
): Occurrence {
  return {
    blockId: block.id,
    categoryId: block.categoryId,
    title: block.title,
    notes: block.notes,
    blockType: block.blockType,
    date,
    startTime: startTime ? normalizeTime(startTime) : null,
    endTime: endTime ? normalizeTime(endTime) : null,
    reminderLeadMinutes: block.reminderLeadMinutes,
    isException,
  };
}

/**
 * Expand a single block into its occurrences within [rangeStart, rangeEnd]
 * (inclusive date keys), applying skip/reschedule exceptions.
 */
export function expandBlock(
  input: ExpandInput,
  rangeStart: string,
  rangeEnd: string
): Occurrence[] {
  const { block, exceptions } = input;
  const exByDate = new Map(exceptions.map((e) => [e.occurrenceDate, e]));
  const results: Occurrence[] = [];

  // Non-recurring: a single occurrence on taskDate.
  if (!block.isRecurring) {
    const d = block.taskDate;
    if (!d || d < rangeStart || d > rangeEnd) return results;
    const ex = exByDate.get(d);
    if (ex?.exceptionType === "skip") return results;
    if (ex?.exceptionType === "reschedule") {
      const finalDate = ex.newDate ?? d;
      if (finalDate < rangeStart || finalDate > rangeEnd) return results;
      results.push(
        makeOccurrence(
          block,
          finalDate,
          ex.newStartTime ?? block.startTime,
          ex.newEndTime ?? block.endTime,
          true
        )
      );
      return results;
    }
    results.push(makeOccurrence(block, d, block.startTime, block.endTime, false));
    return results;
  }

  // Recurring: expand the rrule from the series anchor.
  if (!block.rruleString || !block.seriesStartDate) return results;

  let rule: RRule;
  try {
    rule = new RRule({
      ...RRule.parseString(block.rruleString),
      dtstart: utcDate(block.seriesStartDate),
    });
  } catch {
    return results; // malformed rule — emit nothing rather than crash a view
  }

  const dates = rule.between(utcDate(rangeStart), utcDate(rangeEnd), true);
  for (const dt of dates) {
    const origKey = keyFromUtc(dt);
    const ex = exByDate.get(origKey);
    if (ex?.exceptionType === "skip") continue;
    if (ex?.exceptionType === "reschedule") {
      const finalDate = ex.newDate ?? origKey;
      // Rescheduled out of the visible range — drop here; captured below if it
      // landed inside a different range's scan.
      if (finalDate < rangeStart || finalDate > rangeEnd) continue;
      results.push(
        makeOccurrence(
          block,
          finalDate,
          ex.newStartTime ?? block.startTime,
          ex.newEndTime ?? block.endTime,
          true
        )
      );
      continue;
    }
    results.push(makeOccurrence(block, origKey, block.startTime, block.endTime, false));
  }

  // Reschedules that move an occurrence INTO the range from an original date
  // outside it (so the base expansion above never produced them).
  for (const ex of exceptions) {
    if (ex.exceptionType !== "reschedule") continue;
    if (ex.occurrenceDate >= rangeStart && ex.occurrenceDate <= rangeEnd) continue;
    const finalDate = ex.newDate ?? ex.occurrenceDate;
    if (finalDate < rangeStart || finalDate > rangeEnd) continue;
    results.push(
      makeOccurrence(
        block,
        finalDate,
        ex.newStartTime ?? block.startTime,
        ex.newEndTime ?? block.endTime,
        true
      )
    );
  }

  return results;
}

/** Expand many blocks and return a flat, date-sorted occurrence list. */
export function expandOccurrences(
  inputs: ExpandInput[],
  rangeStart: string,
  rangeEnd: string
): Occurrence[] {
  const all: Occurrence[] = [];
  for (const input of inputs) {
    all.push(...expandBlock(input, rangeStart, rangeEnd));
  }
  all.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    // Flexible tasks (no time) sort before timed blocks within a day.
    const aStart = a.startTime ?? "";
    const bStart = b.startTime ?? "";
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
  return all;
}
