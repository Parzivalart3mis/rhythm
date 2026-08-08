import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { users, pushSubscriptions, reminderDeliveries } from "@/lib/db/schema";
import { loadExpandInputs } from "@/lib/blocks-service";
import { expandOccurrences } from "@/lib/recurrence/expand-occurrences";
import { sendPush } from "@/lib/push/send-push";
import { addDaysKey } from "@/lib/time";
import { cronAuthError } from "@/lib/cron/auth";
import { syncReminderSchedule } from "@/lib/cron/sync";
import type { PlanUser } from "@/lib/cron/schedule-plan";
import {
  REMINDER_EARLY_TOLERANCE_MS,
  REMINDER_LATE_GRACE_MS,
} from "@/lib/constants";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Called by cron-job.org at times derived from the timetable itself (see
// src/lib/cron/schedule-plan.ts). For each user we expand a ±1 day window in
// their timezone and deliver any occurrence whose reminder window is currently
// open; a unique index on (block, occurrenceDate) makes that idempotent, so the
// endpoint is safe to call repeatedly and safe for the scheduler to retry.
//
// The same run then reconciles the remote job's schedule, which is what keeps
// the two in step after a DST transition or as the lookahead window rolls
// forward. That reconcile is a no-op unless the schedule fingerprint changed.
export async function POST(req: Request) {
  const authError = cronAuthError(req);
  if (authError) return authError;

  const now = new Date();
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const allUsers = await db.select().from(users);

  // Timetables are read once and reused for both dispatch and planning.
  const planUsers: PlanUser[] = [];

  for (const user of allUsers) {
    const tz = user.timezone || "UTC";

    const inputs = await loadExpandInputs(user.id);
    if (inputs.length === 0) continue;
    planUsers.push({ timezone: tz, inputs });

    // Local "today" in the user's zone, plus neighbours to cover tz edges.
    const todayKey = formatInTimeZone(now, tz, "yyyy-MM-dd");
    const startKey = addDaysKey(todayKey, -1);
    const endKey = addDaysKey(todayKey, 1);

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

      // Open a little before the exact instant (the scheduler's clock is not
      // ours) and close at the block's start — but never sooner than a short
      // grace period, which is what lets a 0-minute lead fire at all and lets a
      // missed run be caught up by the next one.
      const windowOpens = reminderInstant.getTime() - REMINDER_EARLY_TOLERANCE_MS;
      const windowCloses = Math.max(
        startInstant.getTime(),
        reminderInstant.getTime() + REMINDER_LATE_GRACE_MS
      );
      if (!(now.getTime() >= windowOpens && now.getTime() < windowCloses)) continue;

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

      // Phrase against the actual send time, not the nominal lead, so a run
      // that lands late still reads correctly.
      const minsToStart = Math.round(
        (startInstant.getTime() - now.getTime()) / 60_000
      );
      const payload = {
        title: occ.title,
        body:
          minsToStart >= 1
            ? `Starts in ${minsToStart} min at ${occ.startTime}`
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

  const sync = await syncReminderSchedule({
    reason: "dispatch",
    planUsers,
    now,
  }).catch((err) => ({
    status: "error" as const,
    message: String(err),
  }));

  return NextResponse.json({ ok: true, sent, failed, skipped, sync });
}

// Allow a manual GET trigger (still requires the secret header in production).
export async function GET(req: Request) {
  return POST(req);
}
