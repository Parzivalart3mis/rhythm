import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, categories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { blockInput } from "@/lib/validations";
import {
  unauthorized,
  notFound,
  parseBody,
  apiError,
  serverError,
  rateLimited,
} from "@/lib/api";
import { limitBlockWrite } from "@/lib/rate-limit";
import { loadExpandInputs } from "@/lib/blocks-service";
import { findConflictsForBlock } from "@/lib/recurrence/conflict-check";
import type { ExpandInput } from "@/lib/recurrence/expand-occurrences";
import { addDaysKey } from "@/lib/time";
import { CONFLICT_WINDOW_DAYS } from "@/lib/constants";

type Params = { params: Promise<{ id: string }> };

async function ownedBlock(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.id, id), eq(scheduleBlocks.userId, userId)))
    .limit(1);
  return row ?? null;
}

// GET /api/blocks/:id — raw block, used to seed the series editor.
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const block = await ownedBlock(userId, id);
  if (!block) return notFound("Block not found.");
  return NextResponse.json({ block });
}

// PATCH /api/blocks/:id — edits the whole series (full block replacement).
export async function PATCH(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const { success } = await limitBlockWrite(userId);
  if (!success) return rateLimited();

  const existing = await ownedBlock(userId, id);
  if (!existing) return notFound("Block not found.");

  const parsed = await parseBody(req, blockInput);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!cat) return apiError("validation_error", "Unknown category.", 422);

  if (data.blockType === "fixed_time" && !data.force) {
    const candidate: ExpandInput = {
      block: {
        id,
        categoryId: data.categoryId,
        title: data.title,
        notes: data.notes ?? null,
        blockType: data.blockType,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        taskDate: data.taskDate ?? null,
        isRecurring: data.isRecurring,
        rruleString: data.rruleString ?? null,
        seriesStartDate: data.seriesStartDate ?? null,
        reminderLeadMinutes: data.reminderLeadMinutes,
      },
      exceptions: [],
    };
    const anchor = data.isRecurring ? data.seriesStartDate! : data.taskDate!;
    const windowEnd = addDaysKey(anchor, CONFLICT_WINDOW_DAYS);
    const others = await loadExpandInputs(userId, id);
    const conflicts = findConflictsForBlock(candidate, others, anchor, windowEnd);
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

  try {
    await db
      .update(scheduleBlocks)
      .set({
        categoryId: data.categoryId,
        title: data.title,
        notes: data.notes ?? null,
        blockType: data.blockType,
        startTime: data.blockType === "fixed_time" ? data.startTime ?? null : null,
        endTime: data.blockType === "fixed_time" ? data.endTime ?? null : null,
        taskDate: data.isRecurring ? null : data.taskDate ?? null,
        isRecurring: data.isRecurring,
        rruleString: data.isRecurring ? data.rruleString ?? null : null,
        seriesStartDate: data.isRecurring ? data.seriesStartDate ?? null : null,
        reminderLeadMinutes: data.reminderLeadMinutes,
        updatedAt: new Date(),
      })
      .where(eq(scheduleBlocks.id, id));
    return NextResponse.json({ status: "updated", blockId: id });
  } catch {
    return serverError("Could not update block.");
  }
}

// DELETE /api/blocks/:id — deletes the entire series (exceptions cascade).
export async function DELETE(_req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const existing = await ownedBlock(userId, id);
  if (!existing) return notFound("Block not found.");

  try {
    await db.delete(scheduleBlocks).where(eq(scheduleBlocks.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Could not delete block.");
  }
}
