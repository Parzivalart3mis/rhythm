import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { checkConflictsInput } from "@/lib/validations";
import { unauthorized, parseBody, apiError } from "@/lib/api";
import { loadExpandInputs } from "@/lib/blocks-service";
import { expandOccurrences } from "@/lib/recurrence/expand-occurrences";
import { findConflictsForInterval } from "@/lib/recurrence/conflict-check";

// POST /api/blocks/check-conflicts — pre-flight overlap check used live in the editor.
export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, checkConflictsInput);
  if ("error" in parsed) return parsed.error;
  const { date, startTime, endTime, excludeBlockId } = parsed.data;

  if (startTime >= endTime) {
    return apiError("validation_error", "End time must be after start time.", 422);
  }

  const inputs = await loadExpandInputs(userId, excludeBlockId);
  const occurrences = expandOccurrences(inputs, date, date);
  const conflicts = findConflictsForInterval(
    occurrences,
    date,
    startTime,
    endTime,
    excludeBlockId
  );

  return NextResponse.json({
    hasConflict: conflicts.length > 0,
    conflictingBlocks: conflicts.map((c) => ({
      id: c.blockId,
      title: c.title,
      startTime: c.startTime,
      endTime: c.endTime,
    })),
  });
}
