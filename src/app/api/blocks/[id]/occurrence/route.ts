import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleBlocks, blockExceptions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { occurrenceEdit } from "@/lib/validations";
import { unauthorized, notFound, parseBody, apiError, serverError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

// PATCH /api/blocks/:id/occurrence — skip or reschedule a single occurrence of a
// recurring block, stored as a block_exception overlaid at read time.
export async function PATCH(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const [block] = await db
    .select()
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.id, id), eq(scheduleBlocks.userId, userId)))
    .limit(1);
  if (!block) return notFound("Block not found.");
  if (!block.isRecurring) {
    return apiError(
      "validation_error",
      "Occurrence edits only apply to recurring blocks.",
      422
    );
  }

  const parsed = await parseBody(req, occurrenceEdit);
  if ("error" in parsed) return parsed.error;
  const data = parsed.data;

  const values = {
    scheduleBlockId: id,
    occurrenceDate: data.occurrenceDate,
    exceptionType: data.exceptionType,
    newStartTime: data.exceptionType === "reschedule" ? data.newStartTime ?? null : null,
    newEndTime: data.exceptionType === "reschedule" ? data.newEndTime ?? null : null,
    newDate: data.exceptionType === "reschedule" ? data.newDate ?? null : null,
  };

  try {
    await db
      .insert(blockExceptions)
      .values(values)
      .onConflictDoUpdate({
        target: [blockExceptions.scheduleBlockId, blockExceptions.occurrenceDate],
        set: {
          exceptionType: values.exceptionType,
          newStartTime: values.newStartTime,
          newEndTime: values.newEndTime,
          newDate: values.newDate,
        },
      });
    return NextResponse.json({ status: "applied" });
  } catch {
    return serverError("Could not update occurrence.");
  }
}

// DELETE /api/blocks/:id/occurrence?date=YYYY-MM-DD — remove an exception
// (restore the occurrence to its series default).
export async function DELETE(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  if (!date) return apiError("validation_error", "Missing date.", 422);

  const [block] = await db
    .select({ id: scheduleBlocks.id })
    .from(scheduleBlocks)
    .where(and(eq(scheduleBlocks.id, id), eq(scheduleBlocks.userId, userId)))
    .limit(1);
  if (!block) return notFound("Block not found.");

  await db
    .delete(blockExceptions)
    .where(
      and(
        eq(blockExceptions.scheduleBlockId, id),
        eq(blockExceptions.occurrenceDate, date)
      )
    );
  return NextResponse.json({ ok: true });
}
