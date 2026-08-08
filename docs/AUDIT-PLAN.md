# Audit Plan — Rhythm, 2026-08-08

## Executive Summary

Rhythm is a personal timetable PWA: one always-active recurring schedule, three views
(day agenda, week grid, month calendar), server-side conflict detection on write, and
self-hosted VAPID web-push reminders whose firing times are derived from the timetable
and synced to an external cron.

**Maturity: working side project.** 6 commits over four weeks, ~6,300 lines across 70
files, deployed and in genuine daily use by its author.

**Real strengths.** The recurrence core is the best part of the codebase: occurrences are
computed rather than stored, expansion is done in UTC to dodge DST drift, and the pure
logic carries 53 passing unit tests. Tenant scoping is disciplined — every block,
category and occurrence route re-checks ownership before mutating. And the reminder
pipeline genuinely works end to end, verified in production this afternoon.

**What matters most.** Three things, all in the authoring flow you care about.

First, **the schedule can show blocks that no longer exist.** A rescheduled occurrence is
emitted whenever its new date lands in the viewed range and its original date does not —
without checking the rule still produces it. Confirmed by execution: a rule generating
nothing still yields an occurrence (FUNC-01).

Second, **skipping an occurrence is a one-way door.** The restore endpoint exists and has
no caller anywhere in the UI; recovery means deleting and rebuilding the series (FUNC-02).

Third, **editing a block on the day its reminder already fired silently kills the new
reminder** — the delivery row is claimed per (block, date) and never reconsidered
(FUNC-03). That directly undercuts the premise of the work you just finished.

Below that: validation errors surface as disappearing toasts rather than on the fields
that caused them, which is the friction you'd feel most while authoring.

No CI, no error tracking. Neither is urgent at one user, but both are cheap.

## Ground Truth

**Environment:** branch `master`, clean tree, remote `origin https://github.com/Parzivalart3mis/rhythm.git`

**`pnpm install`** — not run. Phase 1 rules prohibit installing or changing packages;
`node_modules` was already present and every command below ran against it. A cold-install
check remains unverified.

**`pnpm typecheck`** — passes, no output.
```
$ tsc --noEmit
```

**`pnpm test`** — passes.
```
$ vitest run
 Test Files  5 passed (5)
      Tests  53 passed (53)
   Duration  1.31s
```

**`pnpm lint`** — passes with warnings, no errors.
```
✖ 9 problems (0 errors, 9 warnings)
```
All 9 are `react-hooks/set-state-in-effect` in UI files (`useSchedule.ts:28`,
`usePushSubscription.ts:53`, `theme-toggle.tsx:17`, `app-shell.tsx:63`,
`settings/page.tsx:20`, `day/page.tsx:23`, `block-editor-sheet.tsx:57,111`,
`occurrence-editor-sheet.tsx:34`). Pre-existing; none in library code.

**`pnpm build`** — succeeds.
```
✓ Compiled successfully in 3.6s
  Finished TypeScript in 4.5s
✓ Generating static pages (15/15)
```
20 routes: 5 static (`/`, `/day`, `/week`, `/month`, `/settings`), 14 dynamic API
handlers, 1 middleware. Warning emitted: `The "middleware" file convention is
deprecated. Please use "proxy" instead.`

**`pnpm audit`** — 22 advisories: **8 moderate, 14 high**. Highs include Next.js
middleware/proxy bypass in App Router, three Next.js SSRF/DoS issues, two PostCSS path
traversal / arbitrary file read, `sharp`→libvips CVE-2026-33327, `brace-expansion` DoS,
`js-yaml` quadratic CPU, `nanoid` infinite loop. All arrive transitively through `next`,
`@clerk/nextjs`, `@serwist/next` and dev tooling.

**CI** — none. No `.github/` directory exists. That absence is itself a finding
(DEPLOY-01).

**Error tracking** — none. `.env.example` advertises `NEXT_PUBLIC_SENTRY_DSN` and
`SENTRY_AUTH_TOKEN`, but no Sentry package is installed and no source file references it
(DEPLOY-02).

## Findings

### FUNC-01 — Rescheduled occurrences appear even when the rule no longer produces them
**Status:** [verified]
**Evidence:** `src/lib/recurrence/expand-occurrences.ts:158-176` — the trailing
"reschedules that move an occurrence INTO the range" loop emits an occurrence from any
reschedule exception whose `newDate` is in range and whose `occurrenceDate` is out of
range. It never asks whether the rrule still generates `occurrenceDate`. Executed
directly against `expandBlock`: with exception `2026-08-09 → 2026-08-12` and rule
`FREQ=WEEKLY;BYDAY=FR` anchored `2027-01-01` (produces nothing in range), querying
`2026-08-10..2026-08-16` still returned one occurrence on `2026-08-12`.
**Problem:** Editing a series leaves its exception rows untouched (see FUNC-04). Once the
rule stops producing the original date, the stale exception keeps emitting a phantom
occurrence. The in-range guard hides this in day-of views, so it surfaces specifically
when the original date sits outside the window — which for this app's Monday-first week
grid is any Sunday occurrence moved into the following week.
**Impact:** Blocks appear on the calendar that the schedule no longer contains, and
cannot be removed by editing the series. Because `collectReminderTimes` shares this
expander, phantom occurrences also generate real push reminders.
**Fix:** In that loop, construct the RRule once and skip any exception whose
`occurrenceDate` is not produced by it (`rule.between(d, d, true).length > 0`). Add the
three executed cases above as unit tests (TEST-01).
**Priority:** P1   **Effort:** M   **Depends on:** —

### FUNC-02 — A skipped occurrence cannot be restored from the app
**Status:** [verified]
**Evidence:** `src/app/api/blocks/[id]/occurrence/route.ts:65-92` implements
`DELETE ?date=YYYY-MM-DD` to remove an exception. Grepping every component and hook for
callers returns only unrelated DELETEs (`usePushSubscription.ts:96`,
`category-manager.tsx:72`, `occurrence-editor-sheet.tsx:65` — the last deletes the whole
series). No caller for the occurrence DELETE exists.
**Problem:** "Skip just this one" writes a skip exception, the occurrence vanishes from
every view, and because it is gone there is nothing left to tap to bring it back.
**Impact:** An accidental skip is unrecoverable in-app. The only remedy is deleting the
series and rebuilding it, losing every other override with it.
**Fix:** Render skipped occurrences in the day view as a dimmed "Skipped" row with a
Restore action wired to the existing endpoint. That reuses the API as-is; the work is
surfacing skipped dates in `GET /api/blocks` output.
**Priority:** P1   **Effort:** M   **Depends on:** —

### FUNC-03 — Rescheduling a block after its reminder fired kills the new reminder
**Status:** [verified]
**Evidence:** `src/lib/db/schema.ts:120` — `uniqueIndex("reminder_deliveries_block_date_uq")`
on `(scheduleBlockId, occurrenceDate)`. `src/app/api/cron/send-reminders/route.ts:93-97` —
the insert uses `.onConflictDoNothing()` and, when nothing is returned, does
`skipped++; continue;`. Nothing deletes delivery rows when a block is edited
(`src/app/api/blocks/[id]/route.ts:103-122` updates the block only).
**Problem:** Once a reminder fires for (block, date), that pair is permanently claimed.
Move the block to a later time on the same day and the row already exists, so the new
reminder is skipped rather than sent.
**Impact:** Silent. You reschedule this morning's 9am block to 6pm, and no reminder
arrives — with no error anywhere. This defeats the core premise that reminder timing
follows the timetable.
**Fix:** In the block PATCH handler, delete `reminder_deliveries` rows for that block
whose `occurrenceDate >= ` today, so future sends are reconsidered. Do the same in the
occurrence reschedule handler for the affected date.
**Priority:** P1   **Effort:** S   **Depends on:** —

### FUNC-04 — Editing a series silently retains its per-occurrence overrides
**Status:** [verified]
**Evidence:** `src/app/api/blocks/[id]/route.ts:103-122` updates `schedule_blocks` and
never touches `block_exceptions`. The FK cascade in `src/lib/db/schema.ts:78-88` fires
only on delete.
**Problem:** Change a series from 09:00 to 10:00 and any previously rescheduled
occurrence keeps its old custom time, because the exception's `newStartTime` wins during
expansion. Nothing in the UI indicates this.
**Impact:** The series appears to have partially failed to update. Combined with FUNC-01,
stale exceptions are also the source of phantom occurrences.
**Fix:** When the PATCH changes `startTime`, `endTime`, `rruleString` or
`seriesStartDate`, either clear the block's exceptions or show a confirm ("this will
reset 3 customised occurrences"). Clearing is the smaller change and matches what most
calendars do on an "all events" edit.
**Priority:** P2   **Effort:** S   **Depends on:** —

### FUNC-05 — The editor downgrades any recurrence rule it doesn't understand to a one-off
**Status:** [verified]
**Evidence:** `src/lib/recurrence/rrule-builder.ts:29-48` — `parseRecurrenceState` handles
only `DAILY` and `WEEKLY` and otherwise falls through to `{ frequency: "none" }`.
`block-editor-sheet.tsx:64-78` seeds the form from that, and `submit()` then sends
`isRecurring: false` with `taskDate: form.date`.
**Problem:** Opening a monthly (or any unsupported) series in the editor and saving
converts it into a single one-off block, destroying the recurrence.
**Impact:** Latent today — grepping `scripts/seed.ts` and `rrule-builder.ts` confirms
nothing in the product creates a non-daily/weekly rule. It becomes live the moment
monthly recurrence is added (FEAT-04) or a rule is written via the API.
**Fix:** Have `parseRecurrenceState` return an `unsupported` marker; when set, disable the
recurrence controls and show "This repeats on a schedule this editor can't change yet"
rather than silently rewriting it.
**Priority:** P3   **Effort:** S   **Depends on:** —

### UX-01 — The branded splash exists but only matches four iPhone models
**Status:** [verified]
**Evidence:** `src/app/layout.tsx:36-58` declares four `apple-touch-startup-image` links,
matching 430×932, 393×852, 428×926 and 375×667. `public/manifest.webmanifest` sets
`background_color: "#F8F8FA"` and `theme_color: "#4C5FD5"`.
**Problem:** *Does this app need a branded startup experience?* **Yes — keep it, and it
helps.** This is an installed standalone PWA opened many times a day from a home-screen
icon; without a startup image iOS shows a blank white rectangle until first paint, which
reads as a broken app rather than a loading one. But the current coverage misses common
sizes (390×844, 402×874, 375×812, 414×896), so on unmatched devices you get exactly the
blank screen the splash was added to prevent. The fixed light `background_color` also
flashes white before a dark-theme launch.
**Impact:** Perceived load time is worse on any iPhone outside those four, and jarring in
dark mode.
**Fix:** Generate the full startup-image set with `node scripts/generate-assets.mjs`
(already present) and add the missing media queries. Do not remove the splash.
**Priority:** P2   **Effort:** S   **Depends on:** —

### UX-02 — Pinch-zoom is disabled app-wide
**Status:** [verified]
**Evidence:** `src/app/layout.tsx:26-33` — `maximumScale: 1, userScalable: false`.
**Problem:** Blocks the browser zoom users rely on, and the week grid is the densest
surface in the app (10px type at `week/page.tsx`).
**Impact:** Fails WCAG 1.4.4; the week grid is hard to read and cannot be magnified.
**Fix:** Drop `maximumScale` and `userScalable`. The iOS input-focus zoom these usually
guard against is already prevented by 16px form controls.
**Priority:** P2   **Effort:** S   **Depends on:** —

### UX-03 — Validation errors are transient toasts, not field-level messages
**Status:** [verified]
**Evidence:** `block-editor-sheet.tsx:144-161` — `validate()` returns a single string and
`submit()` calls `toast(problem, "error")`. The editor renders no `<form>` element, so
there is no submit event and Enter does not save. No `aria-invalid` or
`aria-describedby` is set on any input.
**Problem:** The error disappears on a timer and never points at the field that caused
it. Only the first problem is reported. Screen readers get no association between the
message and the control.
**Impact:** This is the highest-frequency friction in the flow you care about most —
every failed save costs a re-read of the whole form to find the offending field.
**Fix:** Hold a `Record<field, string>` of errors, render each under its input, set
`aria-invalid`/`aria-describedby`, and wrap the body in a `<form onSubmit>` so Enter
submits.
**Priority:** P2   **Effort:** M   **Depends on:** —

### UX-04 — Dismissing the editor discards everything without warning
**Status:** [verified]
**Evidence:** `src/components/ui/sheet.tsx:25-70` — Radix `Dialog.Content` with default
dismissal; `BlockEditorSheet` passes no `onInteractOutside` or `onEscapeKeyDown` handler
and tracks no dirty state.
**Problem:** Tapping the overlay, pressing Escape, or a stray swipe closes the sheet and
throws away a part-filled block.
**Impact:** Easy to trigger one-handed on a phone; the whole entry is lost with no undo.
**Fix:** Track whether `form` differs from its initial value and, when dirty, intercept
dismissal with a "Discard changes?" confirm.
**Priority:** P2   **Effort:** S   **Depends on:** —

### UX-05 — One-off blocks are described as series
**Status:** [verified]
**Evidence:** `occurrence-editor-sheet.tsx:86-123` — the "Edit series" and "Delete series"
rows render unconditionally; only the skip/move rows are gated on `isRecurring`. The
delete hint reads "Remove this block and all occurrences".
**Problem:** For a non-recurring task there is no series and only one occurrence.
**Impact:** Momentary confusion, and the delete copy overstates what is about to happen.
**Fix:** Switch the labels on `occ.isRecurring` — "Edit block" / "Delete block" /
"Remove this block".
**Priority:** P3   **Effort:** S   **Depends on:** —

### ARCH-01 — No error boundary anywhere in the tree
**Status:** [verified]
**Evidence:** `find src -name "error.tsx" -o -name "global-error.tsx"` returns nothing.
**Problem:** Any render-time throw — a malformed occurrence, a null `startTime` reaching
`formatTime12`, a bad date — unmounts the app to a blank screen with no recovery path.
Several call sites already assert non-null with `!` (`day/page.tsx:129`,
`week/page.tsx` placement code).
**Impact:** In a standalone PWA a blank screen has no address bar to retry from; the user
must force-quit.
**Fix:** Add `src/app/(app)/error.tsx` with a message and a reset button. One file.
**Priority:** P2   **Effort:** S   **Depends on:** —

### ARCH-02 — "Now" indicators freeze at mount and ignore the user's stored timezone
**Status:** [verified]
**Evidence:** `day/page.tsx:29` — `const nowMinutes = new Date().getHours() * 60 + ...`,
computed during render with no timer. `week/page.tsx` does the same inside the day loop.
Both read the browser clock; the user's authoritative zone lives in `users.timezone` and
is used only server-side.
**Problem:** The red "Now" line is correct at load and then drifts for as long as the app
stays open — which for a home-screen PWA is hours. On a device whose OS timezone differs
from the saved one, it is wrong immediately.
**Impact:** The single most glanceable element in the day view quietly lies.
**Fix:** Hoist `now` into state with a 60-second interval, and format against the user's
stored timezone rather than the device's.
**Priority:** P2   **Effort:** S   **Depends on:** —

### ARCH-03 — Day view reads the query string manually instead of through the router
**Status:** [verified]
**Evidence:** `day/page.tsx:21-24` — `new URLSearchParams(window.location.search)` inside
a mount-only `useEffect`.
**Problem:** The view first fetches today, then re-fetches the deep-linked date, so
month→day navigation always costs two requests. Because the effect has an empty
dependency array it never re-runs, so back/forward between dates does nothing.
**Impact:** A wasted request per deep link and broken browser history.
**Fix:** Use `useSearchParams()` and derive `dateKey` from it.
**Priority:** P3   **Effort:** S   **Depends on:** —

### SEC-01 — A push subscription's owner can be reassigned by any authenticated user
**Status:** [verified]
**Evidence:** `src/app/api/push/subscribe/route.ts:24-38` —
`.onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId, p256dhKey, authKey } })`.
The conflict target is the endpoint alone and the update sets `userId`, with no predicate
restricting it to the current owner.
**Problem:** Every other route in the app re-checks ownership before mutating
(`ownedBlock`, `ownedCategory`); this one does not. Any signed-in user who posts an
endpoint already registered to someone else takes ownership of that row.
**Impact:** Cross-tenant. The victim stops receiving their reminders, and their device
starts receiving the attacker's block titles instead. Not exploitable today — there is
one user, and endpoints are unguessable opaque URLs, which is why this is P0 for
correctness rather than for present exposure. It is also the one bug here that gets
materially worse the moment a second account exists.
**Fix:** Add `.where(eq(pushSubscriptions.userId, userId))` to the conflict update so a
foreign endpoint is left alone, or make the unique key `(userId, endpoint)`.
**Priority:** P0   **Effort:** S   **Depends on:** —

### SEC-02 — 22 dependency advisories, 14 of them high
**Status:** [verified]
**Evidence:** `pnpm audit` output in Ground Truth. Highs include a Next.js
middleware/proxy bypass in App Router — directly relevant, since `src/middleware.ts` is
what enforces auth on every non-public route.
**Problem:** All are transitive through `next`, `@clerk/nextjs`, `@serwist/next` and dev
tooling. `next` is pinned to `16.2.10`.
**Impact:** The middleware bypass is the one that matters: it is the single gate in front
of every authenticated page and API route. The PostCSS and esbuild issues are
build-time-only and the `sharp` CVE only affects the local asset script.
**Fix:** Bump `next` to the latest 16.x patch and re-run `pnpm audit`. Check the release
notes first — this is a framework bump on a project with no CI, so verify build and a
manual sign-in afterwards.
**Priority:** P2   **Effort:** S   **Depends on:** DEPLOY-01

### SEC-03 — The live conflict check is unthrottled
**Status:** [inferred]
**Evidence:** `block-editor-sheet.tsx:109-142` debounces 350ms then POSTs to
`/api/blocks/check-conflicts`; that route (`check-conflicts/route.ts`) calls no limiter,
unlike `/api/blocks` which calls `limitBlockWrite`.
**Problem:** Each call re-loads and re-expands the user's entire timetable server-side.
**Impact:** None today — one authenticated user, 40 blocks, 350ms debounce. This becomes
real only with untrusted accounts or a much larger timetable; treat it as hardening, not
a live defect.
**Fix:** Reuse the existing Upstash limiter with a generous per-user window.
**Priority:** P3   **Effort:** S   **Depends on:** —

### PERF-01 — Every view switch and every mutation refetches the full range
**Status:** [verified]
**Evidence:** `src/hooks/useSchedule.ts:26-49` — a `useEffect` keyed on
`[view, dateKey, refreshKey]` that fetches unconditionally with no cache and no
in-flight dedupe. `app-shell.tsx:45` — `bumpRefresh()` increments `refreshKey` after
every save, skip, move and delete.
**Problem:** Paging day→day→back refetches each date every time, and switching
day/week/month refetches from scratch. Each save triggers a full reload of the visible
range.
**Impact:** A visible skeleton flash on every navigation, and on a cold serverless
function the round trip is seconds rather than milliseconds.
**Fix:** Memoise responses by `${view}:${dateKey}` in a ref-backed map inside the hook,
serve the cached value immediately while revalidating, and invalidate on `refreshKey`.
Stays within the "hooks only, no data library" constraint.
**Priority:** P2   **Effort:** M   **Depends on:** —

### PERF-02 — Client fetches have no timeout, so a hung request loads forever
**Status:** [verified]
**Evidence:** `src/lib/client.ts:14-45` — `apiFetch` calls `fetch` with no `signal` and no
`AbortSignal.timeout`. `useSchedule` only leaves `loading: true` until the promise
settles.
**Problem:** On a flaky mobile connection a stalled request never rejects, so the
skeleton stays up indefinitely with no error state and no retry.
**Impact:** The app appears hung. Most likely exactly when a phone is switching between
wifi and cellular — the common case for a PWA.
**Fix:** Add `signal: AbortSignal.timeout(15000)` in `apiFetch` and map the resulting
abort to a retryable `ApiClientError`. `ErrorState` already renders a Retry button.
**Priority:** P2   **Effort:** S   **Depends on:** —

### PERF-03 — Every cold launch pays a redirect before rendering
**Status:** [verified]
**Evidence:** `public/manifest.webmanifest` sets `"start_url": "/"`, and
`src/app/page.tsx` is `redirect("/day")`.
**Problem:** Launching from the home-screen icon hits `/`, takes a server redirect, then
loads `/day` — on top of the Clerk handshake redirect for an expired session.
**Impact:** Extra round trip on the most frequent action in the app, during exactly the
window the splash (UX-01) is covering.
**Fix:** Set `"start_url": "/day"` in the manifest. One line.
**Priority:** P3   **Effort:** S   **Depends on:** —

### TEST-01 — No test covers exceptions interacting with series edits
**Status:** [verified]
**Evidence:** `src/lib/recurrence/expand-occurrences.test.ts` covers skip and reschedule
against a stable rule. No case changes the rule while an exception exists, which is why
FUNC-01 survived 53 passing tests.
**Problem:** The exception overlay is the most intricate logic in the app and its
interaction with rule changes is untested.
**Impact:** FUNC-01 shipped and stayed invisible. A fix without tests will regress.
**Fix:** Add the three cases executed during this audit: original date still produced
(occurrence shows), original date no longer produced (must not show), rule produces
nothing in range (must not show).
**Priority:** P1   **Effort:** S   **Depends on:** FUNC-01

### TEST-02 — The block input schema is untested
**Status:** [verified]
**Evidence:** No test file references `blockInput`. `src/lib/validations/index.ts:22-71`
carries a `superRefine` with five distinct branches — the only guard between the client
and the database.
**Problem:** Server-side validation for the primary write path has zero coverage.
**Impact:** A refactor could weaken a branch silently; the client `validate()` in
`block-editor-sheet.tsx:144` is not a substitute since it checks fewer conditions.
**Fix:** Table-driven test over the branches: fixed-time missing end, end before start,
recurring without rule, recurring without start date, non-recurring without date.
**Priority:** P2   **Effort:** S   **Depends on:** —

### DEPLOY-01 — No CI
**Status:** [verified]
**Evidence:** No `.github/` directory. Vercel builds on push, which runs `next build`
(and therefore typecheck) but never `pnpm lint` or `pnpm test`.
**Problem:** Nothing runs the 53 tests before a deploy. With no code review either, a
green Vercel deploy is the only signal.
**Impact:** A broken test can reach production unnoticed.
**Fix:** One workflow on push and PR running install, typecheck, lint, test. ~20 lines.
**Priority:** P2   **Effort:** S   **Depends on:** —

### DEPLOY-02 — No production error tracking, and the env template implies otherwise
**Status:** [verified]
**Evidence:** `.env.example` lists `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_AUTH_TOKEN`; no
Sentry package is in `package.json` and no source file imports one. Server errors are
handled by returning `serverError()` and, in several `catch` blocks
(`blocks/route.ts:140`, `blocks/[id]/route.ts:123`), the underlying error is discarded
entirely.
**Problem:** A failed save returns "Could not create block." to the user and leaves no
diagnosable trace anywhere.
**Impact:** For a solo maintainer with two hours a week, an unreproducible bug with no
stack trace is the expensive kind.
**Fix:** Smallest useful step is `console.error(err)` in those catch blocks so failures
land in Vercel's function logs. Then either wire Sentry or delete the misleading env
entries.
**Priority:** P2   **Effort:** M   **Depends on:** —

### DEPLOY-03 — The pnpm version is unpinned
**Status:** [verified]
**Evidence:** No `packageManager` field in `package.json`. Lockfile is
`lockfileVersion: '9.0'`; local pnpm is 11.5.2. `pnpm-workspace.yaml` uses
`onlyBuiltDependencies`, a pnpm 10+ key.
**Problem:** Vercel infers the pnpm version. If it selects pnpm 9, the workspace keys are
ignored and build-script approval for `sharp`/`esbuild` changes.
**Impact:** Builds currently succeed, so this is latent — a future Vercel default change
could break the build with no repo change.
**Fix:** Add `"packageManager": "pnpm@10.x"` once you have confirmed Vercel supports that
major. Do not pin to 11 blind; an unsupported pin fails harder than no pin.
**Priority:** P3   **Effort:** S   **Depends on:** —

### FEAT-01 — Quick win: create a block from the slot you tapped
**Status:** [inferred]
**Evidence:** `app-shell.tsx:69-72` — `openEditor` accepts only `prefillDate`. `empty` in
`block-editor-sheet.tsx:31-42` hardcodes `startTime: "09:00", endTime: "10:00"`. The week
grid renders positioned day columns but attaches no click handler to empty space.
**Problem:** Every new block starts at 09:00–10:00 regardless of context, so authoring a
6pm block means editing two time fields every time.
**Impact:** This is the most repeated friction in the flow you named as your priority.
**Fix:** Extend `EditorTarget` with `prefillStart`/`prefillEnd`; add a click handler on
week-grid empty space that converts the y-offset to a time (the inverse of `PX_PER_MIN`
already in `week/page.tsx`) and rounds to 15 minutes.
**Priority:** P2   **Effort:** M   **Depends on:** —

### FEAT-02 — Quick win: duplicate a block
**Status:** [inferred]
**Evidence:** `occurrence-editor-sheet.tsx:86-123` offers edit, move, skip and delete —
no duplicate. `GET /api/blocks/:id` already returns everything needed to seed the form.
**Problem:** Creating a near-identical block means re-entering title, category, times,
recurrence and reminder lead by hand.
**Impact:** A recurring timetable is full of near-duplicates; this is high value for very
little code.
**Fix:** Add a "Duplicate" row that opens the editor with the fetched block's fields but
no `blockId`, so save creates a new one. Mostly reuses the existing prefill path.
**Priority:** P2   **Effort:** S   **Depends on:** —

### FEAT-03 — Core: edit this and all future occurrences
**Status:** [inferred]
**Evidence:** The only edit scopes are whole-series (`PATCH /api/blocks/:id`) and
single-occurrence (`PATCH /api/blocks/:id/occurrence`). `scheduleBlocks` has
`seriesStartDate` but no series end, and `buildRruleString` never emits `UNTIL`.
**Problem:** A timetable that changes partway through a term cannot be expressed. Editing
the series rewrites history; editing one occurrence doesn't carry forward.
**Impact:** This is the main structural gap for the product's actual purpose — a
semester schedule that shifts mid-term.
**Fix:** Split at a date: set `UNTIL` on the existing rule the day before, then create a
new block carrying the new values from that date. Depends on `UNTIL` support, so land
FEAT-04 first. **Smaller first slice:** ship FEAT-04 alone, which already lets you end a
series by hand and start a new one — most of the value, a fraction of the work.
**Priority:** P2   **Effort:** L   **Depends on:** FEAT-04

### FEAT-04 — Core: recurrence end date and monthly repeats
**Status:** [inferred]
**Evidence:** `rrule-builder.ts:13-23` emits only `FREQ=DAILY` and
`FREQ=WEEKLY;BYDAY=...`. The editor exposes exactly two frequency buttons
(`block-editor-sheet.tsx:316-327`).
**Problem:** Every recurring block runs forever. There is no way to say "Tuesdays until
December" or "first of the month".
**Impact:** Finished series stay on the calendar permanently and keep generating
reminders; the only way to stop one is to delete it, losing its history.
**Fix:** Add an optional "Ends on" date emitting `UNTIL=`, and a monthly frequency
emitting `FREQ=MONTHLY;BYMONTHDAY=`. `parseRecurrenceState` must round-trip both — see
FUNC-05, which becomes live the moment monthly exists.
**Priority:** P2   **Effort:** M   **Depends on:** FUNC-05

## Roadmap

| ID | Title | Priority | Effort | Depends on |
|---|---|---|---|---|
| SEC-01 | Push subscription owner can be reassigned | P0 | S | — |
| FUNC-03 | Same-day reschedule kills the new reminder | P1 | S | — |
| FUNC-01 | Phantom occurrences from stale exceptions | P1 | M | — |
| TEST-01 | Test exceptions against series edits | P1 | S | FUNC-01 |
| FUNC-02 | Skipped occurrence cannot be restored | P1 | M | — |
| FUNC-04 | Series edit retains stale overrides | P2 | S | — |
| UX-02 | Pinch-zoom disabled | P2 | S | — |
| UX-04 | No unsaved-changes guard | P2 | S | — |
| UX-01 | Splash covers only four devices | P2 | S | — |
| ARCH-01 | No error boundary | P2 | S | — |
| ARCH-02 | "Now" line freezes, ignores user timezone | P2 | S | — |
| PERF-02 | No fetch timeout | P2 | S | — |
| TEST-02 | Block input schema untested | P2 | S | — |
| DEPLOY-01 | No CI | P2 | S | — |
| FEAT-02 | Duplicate a block | P2 | S | — |
| SEC-02 | 14 high dependency advisories | P2 | S | DEPLOY-01 |
| UX-03 | Field-level validation errors | P2 | M | — |
| PERF-01 | No caching between view switches | P2 | M | — |
| DEPLOY-02 | No production error tracking | P2 | M | — |
| FEAT-01 | Create a block from the tapped slot | P2 | M | — |
| FEAT-04 | Recurrence end date and monthly | P2 | M | FUNC-05 |
| FEAT-03 | Edit this and all future | P2 | L | FEAT-04 |
| FUNC-05 | Unsupported rules downgraded to one-off | P3 | S | — |
| UX-05 | One-off blocks described as series | P3 | S | — |
| ARCH-03 | Query string read outside the router | P3 | S | — |
| SEC-03 | Conflict check unthrottled | P3 | S | — |
| PERF-03 | Cold launch pays a redirect | P3 | S | — |
| DEPLOY-03 | pnpm version unpinned | P3 | S | — |

## Top 5 by ROI

1. **FUNC-03** — Under an hour, and it repairs a silent failure at the exact seam you
   just spent two sessions building. Every other reminder bug would at least be visible;
   this one just quietly doesn't fire.
2. **SEC-01** — A one-line predicate. It is the only P0, and it is the single finding
   that gets strictly more expensive once a second account exists, which your context
   says to plan for.
3. **FUNC-02** — Chosen over the other P1 because it is the only finding where the user
   can destroy something with no way back. The endpoint already exists; this is wiring,
   not design.
4. **UX-03** — The highest-frequency friction in the flow you named as your priority.
   Toast-only validation costs you a full re-read of the form on every rejected save, and
   you author blocks far more often than you hit any bug in this list.
5. **PERF-02** — Fifteen minutes for a real mobile failure mode. Without it a stalled
   request on a phone switching networks leaves the app on a skeleton forever, and the
   retry UI you already built never gets a chance to render.

Deliberately not here: FUNC-01, despite being the most interesting bug found and
verified. It needs a rule-membership check plus tests (M), and it only triggers on a
specific edit-then-view sequence. Fix it right after these five, with TEST-01 in the same
sitting.
