"use client";

import * as React from "react";
import { format } from "date-fns";
import { Bell } from "lucide-react";
import { useApp } from "@/components/app-shell";
import { useSchedule } from "@/hooks/useSchedule";
import { ViewSwitcher } from "@/components/view-switcher";
import { DateNav } from "@/components/date-nav";
import { EmptyState, ErrorState, AgendaSkeleton } from "@/components/view-states";
import { toDateKey, fromDateKey, addDaysKey, formatTime12, timeToMinutes } from "@/lib/time";
import type { OccurrenceView } from "@/types";
import { cn } from "@/lib/utils";

export default function DayPage() {
  const { openOccurrenceEditor, bumpRefresh } = useApp();
  const [dateKey, setDateKey] = React.useState(() => toDateKey(new Date()));
  const { occurrences, loading, error } = useSchedule("day", dateKey);

  // Support deep-linking from the month view: /day?date=YYYY-MM-DD.
  React.useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("date");
    if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) setDateKey(param);
  }, []);

  const isToday = dateKey === toDateKey(new Date());
  const tasks = occurrences.filter((o) => o.startTime === null);
  const timed = occurrences.filter((o) => o.startTime !== null);
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

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
          onToday={() => setDateKey(toDateKey(new Date()))}
        />
      </div>

      {loading ? (
        <AgendaSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={bumpRefresh} />
      ) : occurrences.length === 0 ? (
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
        </div>
      )}
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
