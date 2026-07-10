import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, blockExceptions } from "@/lib/db/schema";
import type { ExpandInput, ExpandableException } from "@/lib/recurrence/expand-occurrences";
import { normalizeTime } from "@/lib/time";

function mapException(e: typeof blockExceptions.$inferSelect): ExpandableException {
  return {
    occurrenceDate: e.occurrenceDate,
    exceptionType: e.exceptionType,
    newStartTime: e.newStartTime ? normalizeTime(e.newStartTime) : null,
    newEndTime: e.newEndTime ? normalizeTime(e.newEndTime) : null,
    newDate: e.newDate,
  };
}

/**
 * Load every schedule block for a user together with its exceptions, shaped for
 * the recurrence expander. Optionally exclude one block (used when editing so a
 * block never conflicts with itself).
 */
export async function loadExpandInputs(
  userId: string,
  excludeBlockId?: string
): Promise<ExpandInput[]> {
  const blocks = await db
    .select()
    .from(scheduleBlocks)
    .where(eq(scheduleBlocks.userId, userId));

  const filtered = excludeBlockId
    ? blocks.filter((b) => b.id !== excludeBlockId)
    : blocks;
  if (filtered.length === 0) return [];

  const ids = filtered.map((b) => b.id);
  const exceptions = await db
    .select()
    .from(blockExceptions)
    .where(inArray(blockExceptions.scheduleBlockId, ids));

  const exByBlock = new Map<string, ExpandableException[]>();
  for (const e of exceptions) {
    const arr = exByBlock.get(e.scheduleBlockId);
    const mapped = mapException(e);
    if (arr) arr.push(mapped);
    else exByBlock.set(e.scheduleBlockId, [mapped]);
  }

  return filtered.map((b) => ({
    block: {
      id: b.id,
      categoryId: b.categoryId,
      title: b.title,
      notes: b.notes,
      blockType: b.blockType,
      startTime: b.startTime ? normalizeTime(b.startTime) : null,
      endTime: b.endTime ? normalizeTime(b.endTime) : null,
      taskDate: b.taskDate,
      isRecurring: b.isRecurring,
      rruleString: b.rruleString,
      seriesStartDate: b.seriesStartDate,
      reminderLeadMinutes: b.reminderLeadMinutes,
    },
    exceptions: exByBlock.get(b.id) ?? [],
  }));
}
