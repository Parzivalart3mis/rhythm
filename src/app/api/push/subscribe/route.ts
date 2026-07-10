import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { pushSubscribeInput } from "@/lib/validations";
import { unauthorized, parseBody, serverError, rateLimited } from "@/lib/api";
import { limitPushSubscribe } from "@/lib/rate-limit";

// POST /api/push/subscribe — register a Web Push subscription for the user.
export async function POST(req: Request) {
  const userId = await requireUser();
  if (!userId) return unauthorized();

  const { success } = await limitPushSubscribe(userId);
  if (!success) return rateLimited();

  const parsed = await parseBody(req, pushSubscribeInput);
  if ("error" in parsed) return parsed.error;
  const { endpoint, keys } = parsed.data;

  try {
    await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: { userId, p256dhKey: keys.p256dh, authKey: keys.auth },
      });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    return serverError("Could not save subscription.");
  }
}
