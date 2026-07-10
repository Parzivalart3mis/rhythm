import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { unauthorized, parseBody } from "@/lib/api";

const unsubscribeInput = z.object({ endpoint: z.string().url() });

// DELETE /api/push/unsubscribe — remove a subscription for the current user.
export async function DELETE(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const parsed = await parseBody(req, unsubscribeInput);
  if ("error" in parsed) return parsed.error;

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, parsed.data.endpoint)
      )
    );
  return NextResponse.json({ ok: true });
}
