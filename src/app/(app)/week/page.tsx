"use client";

import * as React from "react";
import { format, startOfWeek, addWeeks } from "date-fns";
import { useApp } from "@/components/app-shell";
import { useSchedule } from "@/hooks/useSchedule";
import { ViewSwitcher } from "@/components/view-switcher";
import { DateNav } from "@/components/date-nav";
import { ErrorState } from "@/components/view-states";
import { Skeleton } from "@/components/ui/skeleton";
import {
  toDateKey,
  fromDateKey,
  addDaysKey,
  timeToMinutes,
  minutesToTime,
  formatTime12,
} from "@/lib/time";
import type { OccurrenceView } from "@/types";
import { cn } from "@/lib/utils";

const PX_PER_MIN = 0.9;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22;

interface Placed {
  occ: OccurrenceView;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
  conflict: boolean;
}

function placeDay(dayBlocks: OccurrenceView[], gridStartMin: number): Placed[] {
  const items = dayBlocks
    .map((o) => ({ o, s: timeToMinutes(o.startTime!), e: timeToMinutes(o.endTime!) }))
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const placed: Placed[] = [];
  let i = 0;
  while (i < items.length) {
    const cluster = [items[i]];
    let clusterEnd = items[i].e;
    let j = i + 1;
    while (j < items.length && items[j].s < clusterEnd) {
      cluster.push(items[j]);
      clusterEnd = Math.max(clusterEnd, items[j].e);
      j++;
    }
    const colEnds: number[] = [];
    const colOf = new Map<(typeof cluster)[number], number>();
    for (const it of cluster) {
      let c = colEnds.findIndex((end) => end <= it.s);
      if (c === -1) {
        c = colEnds.length;
        colEnds.push(it.e);
      } else {
        colEnds[c] = it.e;
      }
      colOf.set(it, c);
    }
    const cols = colEnds.length;
    const conflict = cluster.length > 1;
    for (const it of cluster) {
      const c = colOf.get(it)!;
      placed.push({
        occ: it.o,
        top: (it.s - gridStartMin) * PX_PER_MIN,
        height: Math.max((it.e - it.s) * PX_PER_MIN, 20),
        leftPct: (c / cols) * 100,
        widthPct: 100 / cols,
        conflict,
      });
    }
    i = j;
  }
  return placed;
}

export default function WeekPage() {
  const { openOccurrenceEditor, bumpRefresh } = useApp();
  const [anchor, setAnchor] = React.useState(() => toDateKey(new Date()));
  const { occurrences, loading, error } = useSchedule("week", anchor);

  const weekStartKey = toDateKey(startOfWeek(fromDateKey(anchor), { weekStartsOn: 1 }));
  const days = Array.from({ length: 7 }, (_, i) => addDaysKey(weekStartKey, i));
  const todayKey = toDateKey(new Date());

  const timed = occurrences.filter((o) => o.startTime !== null);
  const tasks = occurrences.filter((o) => o.startTime === null);

  // Compute the visible hour window from the data (clamped to sane defaults).
  let startHour = DEFAULT_START_HOUR;
  let endHour = DEFAULT_END_HOUR;
  for (const o of timed) {
    startHour = Math.min(startHour, Math.floor(timeToMinutes(o.startTime!) / 60));
    endHour = Math.max(endHour, Math.ceil(timeToMinutes(o.endTime!) / 60));
  }
  const gridStartMin = startHour * 60;
  const gridEndMin = endHour * 60;
  const gridHeight = (gridEndMin - gridStartMin) * PX_PER_MIN;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  const byDay = new Map<string, OccurrenceView[]>();
  for (const o of timed) {
    const arr = byDay.get(o.date);
    if (arr) arr.push(o);
    else byDay.set(o.date, [o]);
  }
  const tasksByDay = new Map<string, OccurrenceView[]>();
  for (const o of tasks) {
    const arr = tasksByDay.get(o.date);
    if (arr) arr.push(o);
    else tasksByDay.set(o.date, [o]);
  }

  const weekLabel = `${format(fromDateKey(weekStartKey), "MMM d")} – ${format(
    fromDateKey(addDaysKey(weekStartKey, 6)),
    "MMM d"
  )}`;

  return (
    <div>
      <div className="week-grid-header app-chrome sticky top-[52px] z-20 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex justify-center">
          <ViewSwitcher />
        </div>
        <DateNav
          label={weekLabel}
          onPrev={() => setAnchor(toDateKey(addWeeks(fromDateKey(anchor), -1)))}
          onNext={() => setAnchor(toDateKey(addWeeks(fromDateKey(anchor), 1)))}
          onToday={() => setAnchor(todayKey)}
        />
      </div>

      {error ? (
        <ErrorState message={error} onRetry={bumpRefresh} />
      ) : (
        <div className="overflow-x-auto pb-6">
          <div className="min-w-[640px] px-2">
            {/* Day headers */}
            <div className="sticky top-0 grid grid-cols-[44px_repeat(7,1fr)] border-b border-border bg-background">
              <div />
              {days.map((d) => {
                const isToday = d === todayKey;
                return (
                  <div key={d} className="px-1 py-1.5 text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">
                      {format(fromDateKey(d), "EEE")}
                    </div>
                    <div
                      className={cn(
                        "mx-auto grid size-7 place-items-center rounded-full text-sm font-semibold tabular-nums",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground"
                      )}
                    >
                      {format(fromDateKey(d), "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Flexible tasks row */}
            <div className="grid grid-cols-[44px_repeat(7,1fr)] border-b border-border">
              <div className="py-1 pr-1 text-right text-[9px] uppercase text-muted-foreground">
                Tasks
              </div>
              {days.map((d) => (
                <div key={d} className="min-h-6 space-y-0.5 p-0.5">
                  {(tasksByDay.get(d) ?? []).map((o) => (
                    <button
                      key={o.blockId}
                      onClick={() => openOccurrenceEditor(o)}
                      className="block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-medium text-white"
                      style={{ backgroundColor: o.categoryColor }}
                    >
                      {o.title}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Time grid */}
            {loading ? (
              <div className="px-2 py-4">
                <Skeleton className="h-64 w-full" />
              </div>
            ) : (
              <div
                className="relative grid grid-cols-[44px_repeat(7,1fr)]"
                style={{ height: gridHeight }}
              >
                {/* Hour gutter + gridlines */}
                <div className="relative">
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                      style={{ top: (h * 60 - gridStartMin) * PX_PER_MIN }}
                    >
                      {formatTime12(minutesToTime(h * 60))}
                    </div>
                  ))}
                </div>

                {days.map((d) => {
                  const placed = placeDay(byDay.get(d) ?? [], gridStartMin);
                  const isToday = d === todayKey;
                  const nowMin =
                    new Date().getHours() * 60 + new Date().getMinutes();
                  const showNow =
                    isToday && nowMin >= gridStartMin && nowMin <= gridEndMin;
                  return (
                    <div key={d} className="relative border-l border-border">
                      {/* hour lines */}
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="absolute inset-x-0 border-t border-border/60"
                          style={{ top: (h * 60 - gridStartMin) * PX_PER_MIN }}
                        />
                      ))}
                      {showNow ? (
                        <div
                          className="absolute inset-x-0 z-10 border-t-2 border-error"
                          style={{ top: (nowMin - gridStartMin) * PX_PER_MIN }}
                        />
                      ) : null}
                      {placed.map((p) => (
                        <button
                          key={p.occ.blockId + p.occ.date}
                          onClick={() => openOccurrenceEditor(p.occ)}
                          className={cn(
                            "block-chip absolute overflow-hidden rounded-md px-1 py-0.5 text-left text-[10px] font-medium leading-tight text-white",
                            p.conflict && "ring-2 ring-error ring-offset-1"
                          )}
                          style={{
                            top: p.top,
                            height: p.height,
                            left: `calc(${p.leftPct}% + 1px)`,
                            width: `calc(${p.widthPct}% - 2px)`,
                            backgroundColor: p.occ.categoryColor,
                          }}
                          title={`${p.occ.title} ${formatTime12(
                            p.occ.startTime!
                          )}–${formatTime12(p.occ.endTime!)}`}
                        >
                          <span className="block truncate">{p.occ.title}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
