import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronSyncState, users } from "@/lib/db/schema";
import { loadExpandInputs } from "@/lib/blocks-service";
import {
  CRONJOB_REQUEST_TIMEOUT_SECONDS,
  SYNC_FAILURE_BACKOFF_MS,
  SYNC_MAX_AGE_MS,
} from "@/lib/constants";
import {
  buildSchedulePlan,
  fingerprintOf,
  type PlanUser,
  type ReminderSchedulePlan,
} from "./schedule-plan";
import {
  CronJobOrgError,
  REQUEST_METHOD_POST,
  createJob,
  isCronJobOrgConfigured,
  listJobs,
  updateJob,
  type CronJobOrgJob,
} from "./cronjob-org";

const STATE_ID = "reminder-job";
const PROVIDER = "cron-job.org";
const ENDPOINT_PATH = "/api/cron/send-reminders";

export type SyncStatus = "created" | "updated" | "unchanged" | "skipped" | "error";

export interface SyncResult {
  status: SyncStatus;
  /** Why a sync was skipped, or what triggered it. */
  reason?: string;
  message?: string;
  jobId?: number;
  /** Hash of schedule + target URL + method; absent when we never got that far. */
  fingerprint?: string;
  firingsPerDay?: number;
  reminderTimeCount?: number;
}

/**
 * The public URL the scheduler should call. Prefers an explicit override, then
 * the app's canonical origin. `VERCEL_URL` is deliberately not used: it points
 * at a per-deployment hostname, so a job pinned to it would break on the next
 * deploy.
 */
export function reminderEndpointUrl(): string | null {
  const explicit = process.env.CRON_TARGET_URL?.trim();
  if (explicit) return explicit;

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (production ? `https://${production}` : "");
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${ENDPOINT_PATH}`;
}

/** Load every user's timetable in the shape the planner wants. */
export async function loadPlanUsers(): Promise<PlanUser[]> {
  const rows = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users);

  const planUsers: PlanUser[] = [];
  for (const row of rows) {
    const inputs = await loadExpandInputs(row.id);
    if (inputs.length > 0) {
      planUsers.push({ timezone: row.timezone || "UTC", inputs });
    }
  }
  return planUsers;
}

async function readState() {
  const [row] = await db
    .select()
    .from(cronSyncState)
    .where(eq(cronSyncState.id, STATE_ID))
    .limit(1);
  return row ?? null;
}

async function writeState(values: {
  jobId?: number | null;
  fingerprint?: string | null;
  scheduleJson?: string | null;
  lastSyncedAt?: Date | null;
  lastAttemptAt?: Date;
  lastError?: string | null;
}) {
  await db
    .insert(cronSyncState)
    .values({ id: STATE_ID, provider: PROVIDER, ...values })
    .onConflictDoUpdate({ target: cronSyncState.id, set: values });
}

/** The job definition we want to exist on cron-job.org. */
function desiredJob(
  plan: ReminderSchedulePlan,
  url: string,
  cronSecret: string
): CronJobOrgJob {
  return {
    url,
    enabled: true,
    title: process.env.CRONJOB_ORG_JOB_TITLE?.trim() || "Rhythm — reminder dispatch",
    saveResponses: true,
    requestTimeout: CRONJOB_REQUEST_TIMEOUT_SECONDS,
    requestMethod: REQUEST_METHOD_POST,
    schedule: plan.schedule,
    extendedData: { headers: { Authorization: `Bearer ${cronSecret}` } },
    notification: { onFailure: true, onSuccess: false, onDisable: true },
  };
}

export interface SyncOptions {
  /** Sync even when the fingerprint is unchanged (manual reconcile). */
  force?: boolean;
  /** Free-text label for logs, e.g. "block.create". */
  reason?: string;
  /** Pre-loaded timetables, so a caller that already read them doesn't re-query. */
  planUsers?: PlanUser[];
  now?: Date;
}

/**
 * Reconcile the remote cron job with the timetable. Cheap and safe to call on
 * every request path: without a fingerprint change it costs one indexed read and
 * makes no network call.
 */
export async function syncReminderSchedule(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { force = false, reason } = options;
  const now = options.now ?? new Date();

  const planUsers = options.planUsers ?? (await loadPlanUsers());
  const plan = buildSchedulePlan(planUsers, now);
  const base: SyncResult = {
    status: "skipped",
    reason,
    firingsPerDay: plan.firingsPerDay,
    reminderTimeCount: plan.reminderTimes.length,
  };

  if (!isCronJobOrgConfigured()) {
    return { ...base, reason: "no_api_key" };
  }
  const url = reminderEndpointUrl();
  if (!url) {
    return { ...base, reason: "no_target_url" };
  }
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return { ...base, reason: "no_cron_secret" };
  }

  // The URL and method are part of what we push, so a change to either has to
  // count as a change even when the firing times are identical.
  const fingerprint = fingerprintOf({
    schedule: plan.schedule,
    url,
    method: REQUEST_METHOD_POST,
  });
  const state = await readState();

  // A matching fingerprint only proves *we* haven't changed anything — the job
  // itself could have been disabled or re-timezoned by hand in their console, so
  // re-push it once a day regardless.
  const stale =
    !state?.lastSyncedAt ||
    now.getTime() - state.lastSyncedAt.getTime() >= SYNC_MAX_AGE_MS;

  if (!force && !stale && state?.jobId != null && state.fingerprint === fingerprint) {
    return { ...base, status: "unchanged", jobId: state.jobId, fingerprint };
  }

  // Don't burn the daily API quota retrying a broken configuration in a loop.
  if (
    !force &&
    state?.lastError &&
    state.lastAttemptAt &&
    now.getTime() - state.lastAttemptAt.getTime() < SYNC_FAILURE_BACKOFF_MS
  ) {
    return { ...base, reason: "backoff", message: state.lastError, fingerprint };
  }

  const job = desiredJob(plan, url, cronSecret);
  const scheduleJson = JSON.stringify(plan.schedule);

  try {
    let jobId = state?.jobId ?? null;
    if (jobId == null) {
      const pinned = Number(process.env.CRONJOB_ORG_JOB_ID ?? "");
      jobId = Number.isFinite(pinned) && pinned > 0 ? pinned : null;
    }

    // Adopt a job already pointing at our endpoint rather than creating a
    // duplicate — this is what makes a job created by hand in their UI, or by an
    // earlier deploy that lost its state row, get picked up instead of doubled.
    if (jobId == null) {
      const existing = await listJobs();
      jobId = existing.find((j) => j.url === url)?.jobId ?? null;
    }

    let status: SyncStatus;
    if (jobId == null) {
      jobId = await createJob(job);
      status = "created";
    } else {
      try {
        await updateJob(jobId, job);
        status = "updated";
      } catch (err) {
        // The stored job was deleted upstream — recreate and re-point.
        if (err instanceof CronJobOrgError && err.status === 404) {
          jobId = await createJob(job);
          status = "created";
        } else {
          throw err;
        }
      }
    }

    await writeState({
      jobId,
      fingerprint,
      scheduleJson,
      lastSyncedAt: now,
      lastAttemptAt: now,
      lastError: null,
    });

    return { ...base, status, jobId, fingerprint };
  } catch (err) {
    const message =
      err instanceof CronJobOrgError ? err.message : `Sync failed: ${String(err)}`;
    await writeState({ lastAttemptAt: now, lastError: message }).catch(() => {});
    return { ...base, status: "error", message, fingerprint };
  }
}

/** Current plan plus stored provider state, for the status endpoint. */
export async function reminderScheduleStatus(now = new Date()) {
  const [plan, state] = await Promise.all([
    loadPlanUsers().then((planUsers) => buildSchedulePlan(planUsers, now)),
    readState(),
  ]);
  return {
    configured: isCronJobOrgConfigured(),
    targetUrl: reminderEndpointUrl(),
    plan,
    state: state
      ? {
          jobId: state.jobId,
          fingerprint: state.fingerprint,
          lastSyncedAt: state.lastSyncedAt,
          lastAttemptAt: state.lastAttemptAt,
          lastError: state.lastError,
        }
      : null,
  };
}
