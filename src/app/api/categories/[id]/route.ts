import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, scheduleBlocks } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { categoryUpdate } from "@/lib/validations";
import { unauthorized, notFound, parseBody, apiError, serverError } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

async function ownedCategory(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function PATCH(req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const existing = await ownedCategory(userId, id);
  if (!existing) return notFound("Category not found.");

  const parsed = await parseBody(req, categoryUpdate);
  if ("error" in parsed) return parsed.error;
  if (Object.keys(parsed.data).length === 0) {
    return apiError("validation_error", "No fields to update.", 422);
  }

  const [updated] = await db
    .update(categories)
    .set(parsed.data)
    .where(eq(categories.id, id))
    .returning();

  return NextResponse.json({ category: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const { id } = await params;

  const existing = await ownedCategory(userId, id);
  if (!existing) return notFound("Category not found.");

  // FK is RESTRICT: block deletion while any block still uses the category.
  const [inUse] = await db
    .select({ id: scheduleBlocks.id })
    .from(scheduleBlocks)
    .where(eq(scheduleBlocks.categoryId, id))
    .limit(1);
  if (inUse) {
    return apiError(
      "conflict",
      "This category is used by one or more blocks. Reassign them first.",
      409
    );
  }

  try {
    await db.delete(categories).where(eq(categories.id, id));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Could not delete category.");
  }
}
