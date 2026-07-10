import { NextResponse } from "next/server";
import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { categoryInput } from "@/lib/validations";
import { unauthorized, parseBody, serverError } from "@/lib/api";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const rows = await db
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.createdAt));

  return NextResponse.json({ categories: rows });
}

export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, categoryInput);
  if ("error" in parsed) return parsed.error;

  try {
    const [created] = await db
      .insert(categories)
      .values({
        userId,
        name: parsed.data.name,
        colorHex: parsed.data.colorHex,
        isDefault: false,
      })
      .returning();
    return NextResponse.json({ category: created }, { status: 201 });
  } catch {
    return serverError("Could not create category.");
  }
}
