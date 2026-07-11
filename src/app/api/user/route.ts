import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { unauthorized, parseBody, serverError } from "@/lib/api";

export async function GET() {
  const userId = await requireUser();
  if (!userId) return unauthorized();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return NextResponse.json({ user });
}

const updateInput = z.object({
  timezone: z.string().min(1).max(64).optional(),
  displayName: z.string().max(100).optional(),
});

export async function PATCH(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, updateInput);
  if ("error" in parsed) return parsed.error;
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ ok: true });
  }

  try {
    await db.update(users).set(parsed.data).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  } catch {
    return serverError("Could not update settings.");
  }
}
