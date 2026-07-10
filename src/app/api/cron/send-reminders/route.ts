import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { users, pushSubscriptions, reminderDeliveries } from "@/lib/db/schema";
import { loadExpandInputs } from "@/lib/blocks-service";
import { expandOccurrences } from "@/lib/recurrence/expand-occurrences";
import { sendPush } from "@/lib/push/send-push";
import { addDaysKey } from "@/lib/time";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs every minute (Vercel Cron). For each user we expand a ±1 day window in
// their timezone, and for any timed occurrence whose reminder window is currently
// open and not yet delivered, we send a web-push and log it (unique index on
// (block, occurrenceDate) makes delivery idempotent).
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (secret && authHeader !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Invalid cron secret." } },
      { status: 401 }
    );
  }

  const now = new Date();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const allUsers = await db.select().from(users);

  for (const user of allUsers) {
    const tz = user.timezone || "UTC";

    // Local "today" in the user's zone, plus neighbours to cover tz edges.
    const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
    const startKey = addDaysKey(todayKey, -1);
    const endKey = addDaysKey(todayKey, 1);

    const inputs = await loadExpandInputs(user.id);
    if (inputs.length === 0) continue;

    const occurrences = expandOccurrences(inputs, startKey, endKey).filter(
      (o) => o.startTime !== null
    );
    if (occurrences.length === 0) continue;

    // Fetch subscriptions once per user.
    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, user.id));

    for (const occ of occurrences) {
      const startInstant = fromZonedTime(`${occ.date}T${occ.startTime}:00`, tz);
      const reminderInstant = new Date(
        startInstant.getTime() - occ.reminderLeadMinutes * 60_000
      );

      // Window is open when the reminder time has arrived but the block hasn't started.
      if (!(reminderInstant <= now && now < startInstant)) continue;

      // Claim the delivery slot atomically; if the row already exists, another
      // run handled it.
      const claimed = await db
        .insert(reminderDeliveries)
        .values({
          scheduleBlockId: occ.blockId,
          occurrenceDate: occ.date,
          status: "sent",
        })
        .onConflictDoNothing()
        .returning({ id: reminderDeliveries.id });
      if (claimed.length === 0) {
        skipped++;
        continue;
      }

      if (subs.length === 0) {
        // No device to notify — leave the delivery logged so we don't retry.
        continue;
      }

      const minsLabel = occ.reminderLeadMinutes;
      const payload = {
        title: occ.title,
        body:
          minsLabel > 0
            ? `Starts in ${minsLabel} min at ${occ.startTime}`
            : `Starting now at ${occ.startTime}`,
        blockId: occ.blockId,
        url: "/day",
      };

      let anySuccess = false;
      for (const sub of subs) {
        const result = await sendPush(
          { endpoint: sub.endpoint, p256dhKey: sub.p256dhKey, authKey: sub.authKey },
          payload
        );
        if (result.ok) {
          anySuccess = true;
        } else if (result.gone) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        }
      }

      if (anySuccess) {
        sent++;
      } else {
        failed++;
        await db
          .update(reminderDeliveries)
          .set({ status: "failed" })
          .where(
            and(
              eq(reminderDeliveries.scheduleBlockId, occ.blockId),
              eq(reminderDeliveries.occurrenceDate, occ.date)
            )
          );
      }
    }
  }

  return NextResponse.json({ ok: true, sent, failed, skipped });
}

// Allow manual GET trigger in dev only (still requires the secret in prod header).
export async function GET(req: Request) {
  return POST(req);
}
