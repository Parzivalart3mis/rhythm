"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Bell, Undo2, Loader2 } from "lucide-react";
import { useApp } from "@/components/app-shell";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiClientError } from "@/lib/client";
import { useSchedule } from "@/hooks/useSchedule";
import { ViewSwitcher } from "@/components/view-switcher";
import { DateNav } from "@/components/date-nav";
import { EmptyState, ErrorState, AgendaSkeleton } from "@/components/view-states";
import {
  toDateKey,
  fromDateKey,
  addDaysKey,
  formatTime12,
  timeToMinutes,
  zonedNow,
} from "@/lib/time";
import { useNow } from "@/hooks/useNow";
import type { OccurrenceView } from "@/types";
import { cn } from "@/lib/utils";

// useSearchParams opts the subtree out of prerendering, so it needs its own
// Suspense boundary — otherwise the whole /day route fails to build statically.
export default function DayPage() {
  return (
    <React.Suspense fallback={<AgendaSkeleton />}>
      <DayView />
    </React.Suspense>
  );
}

function DayView() {
  const { openOccurrenceEditor, bumpRefresh, timezone } = useApp();
  const { toast } = useToast();
  // Ticks, so the Now line tracks the clock instead of freezing at page load.
  const { dateKey: todayKey, minutes: nowMinutes } = zonedNow(useNow(), timezone);
  const router = useRouter();
  const searchParams = useSearchParams();

  // The viewed date lives in the URL, so month -> day deep links resolve in one
  // fetch and browser back/forward moves between dates.
  const param = searchParams.get("date");
  const dateKey =
    param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : toDateKey(new Date());

  const setDateKey = React.useCallback(
    (next: string | ((current: string) => string)) => {
      const value = typeof next === "function" ? next(dateKey) : next;
      router.replace(`/day?date=${value}`, { scroll: false });
    },
    [dateKey, router]
  );
  const { occurrences, skipped, loading, error } = useSchedule("day", dateKey);
  const [restoring, setRestoring] = React.useState<string | null>(null);

  // Undo a skip. Without this the occurrence is gone from every view, leaving
  // nothing to tap and no way back short of rebuilding the series.
  async function restore(occ: OccurrenceView) {
    const key = occ.blockId + occ.date;
    setRestoring(key);
    try {
      await apiFetch(
        `/api/blocks/${occ.blockId}/occurrence?date=${occ.date}`,
        { method: "DELETE" }
      );
      toast("Occurrence restored.", "success");
      bumpRefresh();
    } catch (e) {
      toast(
        e instanceof ApiClientError ? e.message : "Could not restore.",
        "error"
      );
    } finally {
      setRestoring(null);
    }
  }

  const isToday = dateKey === todayKey;
  const tasks = occurrences.filter((o) => o.startTime === null);
  const timed = occurrences.filter((o) => o.startTime !== null);

  return (
    <div>
      <div className="app-chrome sticky top-[52px] z-20 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex justify-center">
          <ViewSwitcher />
        </div>
        <DateNav
          label={format(fromDateKey(dateKey), "EEE, MMM d")}
          onPrev={() => setDateKey((d) => addDaysKey(d, -1))}
          onNext={() => setDateKey((d) => addDaysKey(d, 1))}
          onToday={() => setDateKey(todayKey)}
        />
      </div>

      {loading ? (
        <AgendaSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={bumpRefresh} />
      ) : occurrences.length === 0 && skipped.length === 0 ? (
        <EmptyState message="Nothing scheduled. Tap + to add your first block." />
      ) : (
        <div className="space-y-4 px-4 py-4">
          {tasks.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tasks
              </h3>
              {tasks.map((o) => (
                <TaskRow key={o.blockId + o.date} occ={o} onTap={openOccurrenceEditor} />
              ))}
            </section>
          ) : null}

          {timed.length > 0 ? (
            <section className="space-y-2">
              {tasks.length > 0 ? (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Schedule
                </h3>
              ) : null}
              {timed.map((o, i) => {
                const showNowBefore =
                  isToday &&
                  o.startTime !== null &&
                  timeToMinutes(o.startTime) > nowMinutes &&
                  (i === 0 ||
                    timeToMinutes(timed[i - 1].startTime as string) <= nowMinutes);
                return (
                  <React.Fragment key={o.blockId + o.date}>
                    {showNowBefore ? <NowLine /> : null}
                    <AgendaRow occ={o} onTap={openOccurrenceEditor} />
                  </React.Fragment>
                );
              })}
              {isToday &&
              timed.length > 0 &&
              timeToMinutes(timed[timed.length - 1].startTime as string) <= nowMinutes ? (
                <NowLine />
              ) : null}
            </section>
          ) : null}

          {skipped.length > 0 ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Skipped
              </h3>
              {skipped.map((o) => (
                <SkippedRow
                  key={o.blockId + o.date}
                  occ={o}
                  busy={restoring === o.blockId + o.date}
                  onRestore={() => restore(o)}
                />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function SkippedRow({
  occ,
  busy,
  onRestore,
}: {
  occ: OccurrenceView;
  busy: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3 opacity-60">
      <span
        className="w-1 shrink-0 self-stretch rounded-full"
        style={{ backgroundColor: occ.categoryColor }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground line-through">
          {occ.title}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {occ.startTime && occ.endTime
            ? `${formatTime12(occ.startTime)}–${formatTime12(occ.endTime)} · skipped`
            : "Skipped"}
        </span>
      </span>
      <button
        type="button"
        onClick={onRestore}
        disabled={busy}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-offset disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Undo2 className="size-3.5" />
        )}
        Restore
      </button>
    </div>
  );
}

function NowLine() {
  return (
    <div className="flex items-center gap-2 py-1" aria-hidden>
      <span className="size-2 rounded-full bg-error" />
      <span className="h-px flex-1 bg-error/60" />
      <span className="text-[10px] font-medium uppercase text-error">Now</span>
    </div>
  );
}

function AgendaRow({
  occ,
  onTap,
}: {
  occ: OccurrenceView;
  onTap: (o: OccurrenceView) => void;
}) {
  return (
    <button
      onClick={() => onTap(occ)}
      className="block-chip flex w-full items-stretch gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-surface-offset"
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{ backgroundColor: occ.categoryColor }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="block-title truncate text-sm font-semibold text-foreground">
          {occ.title}
        </span>
        <span className="tabular-nums text-xs text-muted-foreground">
          {formatTime12(occ.startTime!)}–{formatTime12(occ.endTime!)} · {occ.categoryName}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end justify-center gap-1">
        {occ.isException ? (
          <span className="rounded bg-surface-offset px-1.5 py-0.5 text-[10px] text-muted-foreground">
            moved
          </span>
        ) : null}
        <Bell className="size-3.5 text-muted-foreground" aria-hidden />
      </span>
    </button>
  );
}

function TaskRow({
  occ,
  onTap,
}: {
  occ: OccurrenceView;
  onTap: (o: OccurrenceView) => void;
}) {
  return (
    <button
      onClick={() => onTap(occ)}
      className={cn(
        "block-chip flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-card p-3 text-left transition-colors hover:bg-surface-offset"
      )}
    >
      <span
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: occ.categoryColor }}
      />
      <span className="block-title flex-1 truncate text-sm font-medium text-foreground">
        {occ.title}
      </span>
      <span className="text-xs text-muted-foreground">{occ.categoryName}</span>
    </button>
  );
}
