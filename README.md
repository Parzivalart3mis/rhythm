# Rhythm

A personal-first, multiuser timetable PWA. One always-active schedule, three views
(day agenda, week grid, month calendar), recurring blocks with conflict detection,
and web-push reminders that fire on an installed iPhone home-screen app.

> One schedule, three views, smart conflict warnings, and reminders that actually fire.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS v4 + shadcn-style components + Lucide |
| Database | Neon Postgres + Drizzle ORM |
| Auth | Clerk |
| Recurrence | rrule.js (RFC 5545) |
| Push | Web Push (VAPID) + Serwist service worker |
| Rate limiting | Upstash Redis (optional in dev) |
| Hosting | Vercel |
| Scheduling | cron-job.org (schedule derived from the timetable via their REST API) |

## Architecture notes

- **Occurrences are computed, never stored.** Recurring blocks hold an rrule string +
  anchor date; single-occurrence changes are `block_exceptions` rows (skip / reschedule).
  Read-time expansion lives in [`src/lib/recurrence/expand-occurrences.ts`](src/lib/recurrence/expand-occurrences.ts)
  and is done entirely in UTC to avoid DST/timezone off-by-one drift.
- **Conflict detection** ([`src/lib/recurrence/conflict-check.ts`](src/lib/recurrence/conflict-check.ts))
  runs server-side on write across a rolling window, plus a live pre-flight check in the editor.
- **Reminders** are sent by [`/api/cron/send-reminders`](src/app/api/cron/send-reminders/route.ts);
  each occurrence's start is resolved to a UTC instant in the user's timezone, and a unique
  `reminder_deliveries` row makes sends idempotent.
- **The schedule follows the timetable.** [`src/lib/cron/schedule-plan.ts`](src/lib/cron/schedule-plan.ts)
  expands every user's blocks over the next 8 days, turns each `start − reminderLead` into a
  UTC instant, and reduces those to a cron-job.org schedule. Every timetable mutation queues a
  reconcile via [`after()`](src/lib/cron/trigger.ts), so moving a class moves the reminder.
  See [Reminder scheduling](#reminder-scheduling).
- The recurrence, conflict and schedule-planning logic is pure and unit-tested
  (53 tests, `pnpm test`).

## Getting started

```bash
pnpm install
cp .env.example .env.local   # then fill in the values below
pnpm db:migrate              # apply schema (drizzle/migrations) to your Neon database
pnpm seed                    # optional demo data (see below)
pnpm dev                     # http://localhost:3000  (uses --webpack, required by Serwist)
```

> **Note:** the build/dev scripts pass `--webpack` because Serwist does not support
> Turbopack yet. Clerk keys and `DATABASE_URL` are required to actually run the app;
> without them the app builds but API calls fail.

### Environment variables

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=   # Clerk
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=                # for the /api/webhooks/clerk user sync
DATABASE_URL=                        # Neon Postgres connection string
NEXT_PUBLIC_VAPID_PUBLIC_KEY=        # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
UPSTASH_REDIS_REST_URL=              # optional; rate limiting is a no-op without it
UPSTASH_REDIS_REST_TOKEN=
CRON_SECRET=                         # protects the cron endpoints; also sent as the job's auth header
CRONJOB_ORG_API_KEY=                 # optional; without it the remote schedule is never touched
NEXT_PUBLIC_APP_URL=                 # canonical origin the scheduler calls
```

Generate VAPID keys with `npx web-push generate-vapid-keys`.

### Seeding demo data

```bash
SEED_USER_ID=<your Clerk user id> SEED_EMAIL=you@example.com pnpm seed
```

Creates the four default categories (Class, Work, Gym, Personal) and a sample recurring
weekly schedule for that user.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Dev server (webpack) |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest (recurrence, conflicts, time, rrule builder) |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle |
| `pnpm seed` | Local demo data |
| `node scripts/generate-assets.mjs` | Regenerate PWA icons + iOS splash screens |

## Deploying to Vercel

1. Create a Neon database and run `pnpm db:migrate`.
2. Add all env vars in the Vercel project settings.
3. Add a Clerk webhook pointing at `/api/webhooks/clerk` (events: `user.*`).
4. Set up the scheduler — see [Reminder scheduling](#reminder-scheduling). There is no
   `crons` block in `vercel.json`; Hobby-tier Vercel cron only runs daily, which is useless
   for per-block reminders.
5. Deploy. On iPhone Safari: Share → Add to Home Screen, launch from the icon,
   then enable reminders in Settings and confirm a push arrives.

## API surface

All routes require a Clerk session (except the svix-signed webhook and the
`CRON_SECRET`-guarded cron). Errors use `{ error: { code, message } }`.

- `GET/POST /api/categories`, `PATCH/DELETE /api/categories/:id`
- `GET/POST /api/blocks`, `GET/PATCH/DELETE /api/blocks/:id`
- `PATCH/DELETE /api/blocks/:id/occurrence` — single-occurrence skip/reschedule
- `POST /api/blocks/check-conflicts` — live pre-flight
- `POST /api/push/subscribe`, `DELETE /api/push/unsubscribe`
- `POST|GET /api/cron/send-reminders` — dispatch, then reconcile the remote schedule
- `GET|POST /api/cron/sync-schedule` — inspect the derived schedule / force a reconcile
- `GET/PATCH /api/user` — timezone sync
- `POST /api/webhooks/clerk`

## Reminder scheduling

Reminders are per-block, so there is no single "reminder time" to configure — the firing
times *are* the timetable. The app owns one cron-job.org job and rewrites its schedule
whenever the timetable changes.

**How a time is derived.** For each timed occurrence in the next 8 days, the reminder
instant is `start − reminderLeadMinutes`, resolved in that user's timezone and expressed in
UTC. UTC is the shared clock: one job serves every user in every zone, and because the
lookahead spans a DST boundary before it arrives, both the pre- and post-transition UTC
times are already in the plan — nothing drifts.

**Why the job fires slightly more often than needed.** cron-job.org's schedule is a cross
product of `hours[]` and `minutes[]`, not a list of exact pairs, so reminders at 13:50 and
18:20 also produce runs at 13:20 and 18:50. Those extra runs are harmless — the dispatch
endpoint only sends when an occurrence's window is genuinely open — and the result is still
far cheaper than the blanket every-minute job this replaces. A few fixed heartbeat hours are
added so the endpoint keeps running (and keeps re-checking its own schedule) even when the
timetable is empty.

**Why syncs are rare.** The API allows 100 requests/day. The plan is hashed and the hash
stored in `cron_sync_state`; the API is called only when that hash changes. A steady weekly
timetable produces the same hash every day, so an unchanged schedule costs one indexed read
and no network call. Failures back off for 5 minutes so a misconfiguration can't drain the
quota.

**Setup.**

1. Create a cron-job.org account and generate an API key (Settings → API).
2. Set `CRONJOB_ORG_API_KEY`, `CRON_SECRET` and `NEXT_PUBLIC_APP_URL` in Vercel
   (Production + Preview), then redeploy.
3. Bootstrap the job — this creates it, points it at your deployment, and attaches the
   `Authorization` header:

   ```bash
   curl -X POST https://<your-app>.vercel.app/api/cron/sync-schedule \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   Expect `{"status":"created","jobId":...}`. Running it again returns `"unchanged"`.
4. Inspect what the timetable currently implies at any time:

   ```bash
   curl https://<your-app>.vercel.app/api/cron/sync-schedule \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

   This is a dry run — it reports `reminderTimes`, `firingsPerDay` and the last sync state
   without calling the provider.

An existing job already pointing at `/api/cron/send-reminders` is adopted rather than
duplicated, so a job created by hand in their UI is picked up on the first sync. Without
`CRONJOB_ORG_API_KEY` the app never calls out and the job's schedule is left exactly as you
configured it — reminders still work, they just don't follow the timetable automatically.

## Out of scope (V1)

Offline editing, external calendar sync, multiple named timetables, done-tracking,
payments, shared/collaborative schedules.
