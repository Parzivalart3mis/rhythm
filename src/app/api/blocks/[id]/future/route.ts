import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, blockExceptions, categories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { blockInput } from "@/lib/validations";
import {
  unauthorized,
  notFound,
  apiError,
  serverError,
  rateLimited,
  validationError,
} from "@/lib/api";
import { limitBlockWrite } from "@/lib/rate-limit";
import { loadExpandInputs, releaseDeliveryClaims } from "@/lib/blocks-service";
import { queueReminderScheduleSync } from "@/lib/cron/trigger";
import { findConflictsForBlock } from "@/lib/recurrence/conflict-check";
import type { ExpandInput } from "@/lib/recurrence/expand-occurrences";
import { withUntil } from "@/lib/recurrence/rrule-builder";
import { addDaysKey } from "@/lib/time";
import { CONFLICT_WINDOW_DAYS } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

const splitPoint = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});

/**
 * PATCH /api/blocks/:id/future — "this and all following occurrences".
 *
 * Editing a whole series rewrites history; editing one occurrence doesn't carry
 * forward. This splits the series at `fromDate`: the original is capped the day
 * before with UNTIL, and a new block carries the submitted values from
 * `fromDate` onward. Past occurrences keep whatever they always were.
 */
export async function PATCH(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const { success } = await limitBlockWrite(userId);
  if (!success) return rateLimited();

  const [existing] = await db
    .select()
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.id, id), eq(scheduleBlocks.userId, userId)))
    .limit(1);
  if (!existing) return notFound("Block not found.");

  if (!existing.isRecurring || !existing.rruleString || !existing.seriesStartDate) {
    return apiError(
      "validation_error",
      "Only a recurring series can be split.",
      422
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return apiError("validation_error", "Invalid JSON body.", 422);
  }

  const point = splitPoint.safeParse(json);
  if (!point.success) return validationError(point.error);
  const { fromDate } = point.data;

  let data;
  try {
    data = blockInput.parse(json);
  } catch (e) {
    if (e instanceof ZodError) return validationError(e);
    throw e;
  }

  // Splitting at or before the anchor would leave an empty first half — that's
  // just an edit of the whole series, which the plain PATCH already does.
  if (fromDate <= existing.seriesStartDate) {
    return apiError(
      "validation_error",
      "That's the start of the series — edit the whole series instead.",
      422
    );
  }

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!cat) return apiError("validation_error", "Unknown category.", 422);

  // The new half must be a series too; a one-off would silently drop the rest.
  if (!data.isRecurring || !data.rruleString) {
    return apiError(
      "validation_error",
      "Turn off Repeat on the whole series instead of splitting it.",
      422
    );
  }

  if (data.blockType === "fixed_time" && !data.force) {
    const candidate: ExpandInput = {
      block: {
        id: "__candidate__",
        categoryId: data.categoryId,
        title: data.title,
        notes: data.notes ?? null,
        blockType: data.blockType,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        taskDate: null,
        isRecurring: true,
        rruleString: data.rruleString,
        seriesStartDate: fromDate,
        reminderLeadMinutes: data.reminderLeadMinutes,
      },
      exceptions: [],
    };
    // The original is excluded: it is capped before fromDate, so the two halves
    // are disjoint by construction and can't clash with each other.
    const others = await loadExpandInputs(userId, id);
    const conflicts = findConflictsForBlock(
      candidate,
      others,
      fromDate,
      addDaysKey(fromDate, CONFLICT_WINDOW_DAYS)
    );
    if (conflicts.length > 0) {
      return NextResponse.json({
        status: "conflict_warning",
        conflictingBlocks: conflicts.map((c) => ({
          id: c.blockId,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime,
        })),
      });
    }
  }

  const lastDay = addDaysKey(fromDate, -1);

  try {
    // Cap the original. Textual UNTIL keeps rule forms we can't model intact.
    await db
      .update(scheduleBlocks)
      .set({
        rruleString: withUntil(existing.rruleString, lastDay),
        updatedAt: new Date(),
      })
      .where(eq(scheduleBlocks.id, id));

    // Overrides from fromDate onward described occurrences that now belong to
    // the new block; left behind they'd haunt a series that no longer reaches
    // those dates.
    await db
      .delete(blockExceptions)
      .where(
        and(
          eq(blockExceptions.scheduleBlockId, id),
          gte(blockExceptions.occurrenceDate, fromDate)
        )
      );

    const [created] = await db
      .insert(scheduleBlocks)
      .values({
        userId,
        categoryId: data.categoryId,
        title: data.title,
        notes: data.notes ?? null,
        blockType: data.blockType,
        startTime: data.blockType === "fixed_time" ? data.startTime ?? null : null,
        endTime: data.blockType === "fixed_time" ? data.endTime ?? null : null,
        taskDate: null,
        isRecurring: true,
        rruleString: data.rruleString,
        seriesStartDate: fromDate,
        reminderLeadMinutes: data.reminderLeadMinutes,
      })
      .returning({ id: scheduleBlocks.id });

    // The original no longer occurs from fromDate on, so its claims for those
    // dates must not suppress the new block's reminders.
    await releaseDeliveryClaims(id);

    queueReminderScheduleSync("block.split");
    return NextResponse.json({
      status: "updated",
      blockId: created.id,
      previousBlockId: id,
      endedOn: lastDay,
    });
  } catch (err) {
    console.error("Split series failed:", err);
    return serverError("Could not update future occurrences.");
  }
}
