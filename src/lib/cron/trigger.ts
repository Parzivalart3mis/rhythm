import { after } from "next/server";
import { syncReminderSchedule } from "./sync";

/**
 * Queue a schedule reconcile to run once the response has been sent. Every
 * timetable mutation calls this: the reminder firing times are derived from the
 * timetable, so changing the timetable is what changes the schedule.
 *
 * Deliberately silent — a scheduler hiccup must never fail a user's edit. The
 * dispatch endpoint reconciles again on its own runs, so a dropped sync
 * self-heals within a heartbeat.
 */
export function queueReminderScheduleSync(reason: string): void {
  try {
    after(async () => {
      try {
        const result = await syncReminderSchedule({ reason });
        if (result.status === "error") {
          console.error(`[cron-sync] ${reason}: ${result.message}`);
        }
      } catch (err) {
        console.error(`[cron-sync] ${reason} threw:`, err);
      }
    });
  } catch {
    // `after` throws when called outside a request scope.
  }
}
