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
| Hosting | Vercel (cron for reminders) |

## Architecture notes

- **Occurrences are computed, never stored.** Recurring blocks hold an rrule string +
  anchor date; single-occurrence changes are `block_exceptions` rows (skip / reschedule).
  Read-time expansion lives in [`src/lib/recurrence/expand-occurrences.ts`](src/lib/recurrence/expand-occurrences.ts)
  and is done entirely in UTC to avoid DST/timezone off-by-one drift.
- **Conflict detection** ([`src/lib/recurrence/conflict-check.ts`](src/lib/recurrence/conflict-check.ts))
  runs server-side on write across a rolling window, plus a live pre-flight check in the editor.
- **Reminders** are sent by [`/api/cron/send-reminders`](src/app/api/cron/send-reminders/route.ts)
  every minute; each occurrence's start is resolved to a UTC instant in the user's timezone,
  and a unique `reminder_deliveries` row makes sends idempotent.
- The recurrence + conflict logic is pure and unit-tested (30 tests, `pnpm test`).

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
CRON_SECRET=                         # protects the reminder cron endpoint
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
4. `vercel.json` already registers the every-minute reminder cron.
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
- `POST|GET /api/cron/send-reminders`
- `GET/PATCH /api/user` — timezone sync
- `POST /api/webhooks/clerk`

## Out of scope (V1)

Offline editing, external calendar sync, multiple named timetables, done-tracking,
payments, shared/collaborative schedules.
