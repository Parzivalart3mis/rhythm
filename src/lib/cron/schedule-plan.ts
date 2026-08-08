import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  expandOccurrences,
  type ExpandInput,
} from "@/lib/recurrence/expand-occurrences";
import { addDaysKey } from "@/lib/time";
import {
  HEARTBEAT_FALLBACK_MINUTE,
  HEARTBEAT_UTC_HOURS,
  SCHEDULE_LOOKAHEAD_DAYS,
} from "@/lib/constants";

// Turns the timetable into a cron schedule. Every timed occurrence in the next
// SCHEDULE_LOOKAHEAD_DAYS resolves to an instant (start minus its reminder lead)
// which we express in UTC — one shared clock for all users, so a single remote
// job serves everyone and no fixed local time can drift across DST.
//
// cron-job.org's schedule is a cross product of its hours[] and minutes[]
// arrays, not a list of pairs, so the job fires at a superset of the exact
// reminder instants. That is harmless: the dispatch endpoint only sends when an
// occurrence's window is actually open, and the extra runs cost nothing but an
// invocation. A weekly timetable of ~10 reminders typically lands well under
// 100 runs/day versus the 1440 of a blanket every-minute job.

export interface PlanUser {
  timezone: string;
  inputs: ExpandInput[];
}

/** A cron-job.org schedule object. `-1` in an array means "every". */
export interface CronSchedule {
  timezone: string;
  expiresAt: number;
  hours: number[];
  mdays: number[];
  minutes: number[];
  months: number[];
  wdays: number[];
}

export interface ReminderSchedulePlan {
  schedule: CronSchedule;
  /** Stable hash of `schedule`; the sync only calls the API when this changes. */
  fingerprint: string;
  /** Exact UTC "HH:MM" instants a reminder is genuinely due at. */
  reminderTimes: string[];
  /** How many times the remote job will actually call the endpoint per day. */
  firingsPerDay: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** FNV-1a, 32-bit. Small, stable across runtimes, and enough to detect change. */
export function fingerprintOf(value: unknown): string {
  const str = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** Today's date key in `timezone`, falling back to UTC for an unknown zone. */
function localTodayKey(now: Date, timezone: string): string {
  try {
    return formatInTimeZone(now, timezone, "yyyy-MM-dd");
  } catch {
    return formatInTimeZone(now, "UTC", "yyyy-MM-dd");
  }
}

/**
 * Every distinct UTC "HH:MM" at which some user's reminder comes due within the
 * lookahead window. Occurrences earlier today are kept rather than filtered:
 * for a weekly series they are next week's times anyway, and keeping them stops
 * the plan from churning as the day advances.
 */
export function collectReminderTimes(
  users: PlanUser[],
  now: Date,
  lookaheadDays: number = SCHEDULE_LOOKAHEAD_DAYS
): string[] {
  const times = new Set<string>();

  for (const { timezone, inputs } of users) {
    if (inputs.length === 0) continue;
    const tz = timezone || "UTC";
    const startKey = localTodayKey(now, tz);
    const endKey = addDaysKey(startKey, lookaheadDays);

    for (const occ of expandOccurrences(inputs, startKey, endKey)) {
      if (!occ.startTime) continue; // flexible tasks have no reminder instant
      let start: Date;
      try {
        start = fromZonedTime(`${occ.date}T${occ.startTime}:00`, tz);
      } catch {
        continue;
      }
      if (Number.isNaN(start.getTime())) continue;
      const fire = new Date(start.getTime() - occ.reminderLeadMinutes * 60_000);
      times.add(`${pad2(fire.getUTCHours())}:${pad2(fire.getUTCMinutes())}`);
    }
  }

  return [...times].sort();
}

/** Derive the remote job's schedule from the current timetable. */
export function buildSchedulePlan(
  users: PlanUser[],
  now: Date,
  lookaheadDays: number = SCHEDULE_LOOKAHEAD_DAYS
): ReminderSchedulePlan {
  const reminderTimes = collectReminderTimes(users, now, lookaheadDays);

  const hours = new Set<number>();
  const minutes = new Set<number>();
  for (const time of reminderTimes) {
    const [h, m] = time.split(":").map(Number);
    hours.add(h);
    minutes.add(m);
  }

  // Reuse a minute the schedule already fires on so the heartbeat costs extra
  // hours but never widens the cross product's minute axis.
  const heartbeatMinute =
    minutes.size > 0 ? Math.min(...minutes) : HEARTBEAT_FALLBACK_MINUTE;
  minutes.add(heartbeatMinute);
  for (const hour of HEARTBEAT_UTC_HOURS) hours.add(hour);

  const schedule: CronSchedule = {
    timezone: "UTC",
    expiresAt: 0,
    hours: [...hours].sort((a, b) => a - b),
    mdays: [-1],
    minutes: [...minutes].sort((a, b) => a - b),
    months: [-1],
    wdays: [-1],
  };

  return {
    schedule,
    fingerprint: fingerprintOf(schedule),
    reminderTimes,
    firingsPerDay: schedule.hours.length * schedule.minutes.length,
  };
}
