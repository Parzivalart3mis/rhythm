import { NextResponse } from "next/server";
import { cronAuthError } from "@/lib/cron/auth";
import { reminderScheduleStatus, syncReminderSchedule } from "@/lib/cron/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET  — dry run: what schedule the current timetable implies, and what we last
//        pushed to the provider. Touches no external API.
// POST — force a reconcile. Used once to bootstrap the job, and any time you
//        want to repair it by hand.
//
// Both are guarded by CRON_SECRET, like the dispatch endpoint.

export async function GET(req: Request) {
  const authError = cronAuthError(req);
  if (authError) return authError;

  const status = await reminderScheduleStatus();
  return NextResponse.json({
    ok: true,
    configured: status.configured,
    targetUrl: status.targetUrl,
    schedule: status.plan.schedule,
    // Hash of the schedule alone; `state.fingerprint` also covers the target
    // URL and method, so the two are expected to differ.
    scheduleFingerprint: status.plan.fingerprint,
    reminderTimes: status.plan.reminderTimes,
    firingsPerDay: status.plan.firingsPerDay,
    state: status.state,
  });
}

export async function POST(req: Request) {
  const authError = cronAuthError(req);
  if (authError) return authError;

  const result = await syncReminderSchedule({ force: true, reason: "manual" });
  return NextResponse.json(result, {
    status: result.status === "error" ? 502 : 200,
  });
}
