import type { CronSchedule } from "./schedule-plan";

// Minimal client for the cron-job.org REST API (https://docs.cron-job.org/rest-api.html).
// Quotas are tight — 100 requests/day on a free account — so callers must only
// reach for this when something has actually changed.

const API_BASE = "https://api.cron-job.org";

// The dispatch endpoint reconciles inline and cron-job.org kills free-account
// executions at 30s, so an unresponsive API must not eat that budget.
const REQUEST_TIMEOUT_MS = 10_000;

/** cron-job.org's requestMethod enum (0=GET, 1=POST, ...). */
export const REQUEST_METHOD_POST = 1;

export class CronJobOrgError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CronJobOrgError";
    this.status = status;
  }
}

export interface CronJobOrgJob {
  jobId?: number;
  enabled?: boolean;
  title?: string;
  url?: string;
  saveResponses?: boolean;
  requestTimeout?: number;
  requestMethod?: number;
  schedule?: CronSchedule;
  extendedData?: { headers?: Record<string, string>; body?: string };
  notification?: {
    onFailure?: boolean;
    onSuccess?: boolean;
    onDisable?: boolean;
  };
}

function cronJobOrgApiKey(): string | null {
  return process.env.CRONJOB_ORG_API_KEY?.trim() || null;
}

export function isCronJobOrgConfigured(): boolean {
  return cronJobOrgApiKey() !== null;
}

async function request<T>(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" }
): Promise<T> {
  const apiKey = cronJobOrgApiKey();
  if (!apiKey) {
    throw new CronJobOrgError("CRONJOB_ORG_API_KEY is not set.", 0);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    throw new CronJobOrgError(`Network error calling ${path}: ${String(err)}`, 0);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new CronJobOrgError(
      `${init.method} ${path} → ${res.status} ${text.slice(0, 200)}`,
      res.status
    );
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new CronJobOrgError(`${init.method} ${path} → unparseable response`, res.status);
  }
}

export async function listJobs(): Promise<CronJobOrgJob[]> {
  const data = await request<{ jobs?: CronJobOrgJob[] }>("/jobs");
  return data.jobs ?? [];
}

export async function createJob(job: CronJobOrgJob): Promise<number> {
  const data = await request<{ jobId: number }>("/jobs", {
    method: "PUT",
    body: { job },
  });
  return data.jobId;
}

/** Partial update — only the fields present are changed. */
export async function updateJob(jobId: number, job: CronJobOrgJob): Promise<void> {
  await request(`/jobs/${jobId}`, { method: "PATCH", body: { job } });
}

