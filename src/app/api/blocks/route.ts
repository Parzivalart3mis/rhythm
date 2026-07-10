import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, categories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { blockInput, viewQuery } from "@/lib/validations";
import {
  unauthorized,
  parseBody,
  apiError,
  serverError,
  rateLimited,
  validationError,
} from "@/lib/api";
import { limitBlockWrite } from "@/lib/rate-limit";
import { loadExpandInputs } from "@/lib/blocks-service";
import { findConflictsForBlock } from "@/lib/recurrence/conflict-check";
import {
  expandOccurrences,
  type ExpandInput,
} from "@/lib/recurrence/expand-occurrences";
import { viewRange } from "@/lib/view-range";
import { addDaysKey } from "@/lib/time";
import { CONFLICT_WINDOW_DAYS } from "@/lib/constants";
import { ZodError } from "zod";

// GET /api/blocks?view=day|week|month&date=YYYY-MM-DD
export async function GET(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const url = new URL(req.url);
  let query;
  try {
    query = viewQuery.parse({
      view: url.searchParams.get("view"),
      date: url.searchParams.get("date"),
    });
  } catch (e) {
    if (e instanceof ZodError) return validationError(e);
    throw e;
  }

  const { start, end } = viewRange(query.view, query.date);
  const [inputs, cats] = await Promise.all([
    loadExpandInputs(userId),
    db.select().from(categories).where(eq(categories.userId, userId)),
  ]);

  const catMap = new Map(cats.map((c) => [c.id, c]));
  const occurrences = expandOccurrences(inputs, start, end).map((o) => {
    const cat = catMap.get(o.categoryId);
    return {
      ...o,
      categoryName: cat?.name ?? "Uncategorized",
      categoryColor: cat?.colorHex ?? "#64748B",
    };
  });

  return NextResponse.json({ range: { start, end }, occurrences });
}

// POST /api/blocks — create, with a server-side conflict pre-check.
export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { success } = await limitBlockWrite(userId);
  if (!success) return rateLimited();

  const parsed = await parseBody(req, blockInput);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  // Verify the category belongs to the user.
  const [cat] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, data.categoryId), eq(categories.userId, userId)))
    .limit(1);
  if (!cat) return apiError("validation_error", "Unknown category.", 422);

  // Conflict detection for timed blocks (flexible tasks never conflict).
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
    const existing = await loadExpandInputs(userId);
    const conflicts = findConflictsForBlock(candidate, existing, anchor, windowEnd);
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
        taskDate: data.isRecurring ? null : data.taskDate ?? null,
        isRecurring: data.isRecurring,
        rruleString: data.isRecurring ? data.rruleString ?? null : null,
        seriesStartDate: data.isRecurring ? data.seriesStartDate ?? null : null,
        reminderLeadMinutes: data.reminderLeadMinutes,
      })
      .returning({ id: scheduleBlocks.id });
    return NextResponse.json({ status: "created", blockId: created.id }, { status: 201 });
  } catch {
    return serverError("Could not create block.");
  }
}
