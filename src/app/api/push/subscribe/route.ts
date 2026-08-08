import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { pushSubscribeInput } from "@/lib/validations";
import {
  unauthorized,
  parseBody,
  serverError,
  rateLimited,
  apiError,
} from "@/lib/api";
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
    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        // Only refresh a row this user already owns. Without the predicate the
        // update would reassign userId, handing one account's push channel to
        // whoever posts its endpoint — the victim would stop receiving their
        // reminders and start receiving the other account's.
        setWhere: eq(pushSubscriptions.userId, userId),
        set: { p256dhKey: keys.p256dh, authKey: keys.auth },
      })
      .returning({ id: pushSubscriptions.id });

    // No row came back: the endpoint exists under a different account, so the
    // conflict predicate matched nothing. The caller has to mint a fresh
    // subscription instead of taking this one over.
    if (!row) {
      return apiError(
        "conflict",
        "This device is registered to another account. Re-subscribing will issue a new one.",
        409
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Save push subscription failed:", err);
    return serverError("Could not save subscription.");
  }
}
