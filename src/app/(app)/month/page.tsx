"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format, addMonths, isSameMonth } from "date-fns";
import { useApp } from "@/components/app-shell";
import { useSchedule } from "@/hooks/useSchedule";
import { ViewSwitcher } from "@/components/view-switcher";
import { DateNav } from "@/components/date-nav";
import { ErrorState } from "@/components/view-states";
import { Skeleton } from "@/components/ui/skeleton";
import { toDateKey, fromDateKey } from "@/lib/time";
import { WEEKDAYS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export default function MonthPage() {
  const router = useRouter();
  const { bumpRefresh } = useApp();
  const [anchor, setAnchor] = React.useState(() => toDateKey(new Date()));
  const { occurrences, range, loading, error } = useSchedule("month", anchor);

  const todayKey = toDateKey(new Date());
  const anchorDate = fromDateKey(anchor);

  // Unique category colors per day (max 4 dots shown).
  const dotsByDay = new Map<string, string[]>();
  for (const o of occurrences) {
    const colors = dotsByDay.get(o.date) ?? [];
    if (!colors.includes(o.categoryColor)) colors.push(o.categoryColor);
    dotsByDay.set(o.date, colors);
  }
  const countByDay = new Map<string, number>();
  for (const o of occurrences) {
    countByDay.set(o.date, (countByDay.get(o.date) ?? 0) + 1);
  }

  const gridDays: string[] = [];
  if (range) {
    let cur = range.start;
    while (cur <= range.end) {
      gridDays.push(cur);
      const d = fromDateKey(cur);
      d.setDate(d.getDate() + 1);
      cur = toDateKey(d);
    }
  }

  return (
    <div>
      <div className="app-chrome sticky top-[52px] z-20 space-y-3 bg-background/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex justify-center">
          <ViewSwitcher />
        </div>
        <DateNav
          label={format(anchorDate, "MMMM yyyy")}
          onPrev={() => setAnchor(toDateKey(addMonths(anchorDate, -1)))}
          onNext={() => setAnchor(toDateKey(addMonths(anchorDate, 1)))}
          onToday={() => setAnchor(todayKey)}
        />
        <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={bumpRefresh} />
      ) : loading ? (
        <div className="px-4 py-4">
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-px px-2 py-2">
          {gridDays.map((d) => {
            const inMonth = isSameMonth(fromDateKey(d), anchorDate);
            const isToday = d === todayKey;
            const dots = dotsByDay.get(d) ?? [];
            const count = countByDay.get(d) ?? 0;
            return (
              <button
                key={d}
                onClick={() => router.push(`/day?date=${d}`)}
                className={cn(
                  "grid-cell flex min-h-16 flex-col items-center gap-1 rounded-md border border-transparent p-1 transition-colors hover:bg-surface-offset",
                  !inMonth && "opacity-40"
                )}
              >
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full text-xs font-semibold tabular-nums",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground"
                  )}
                >
                  {format(fromDateKey(d), "d")}
                </span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {dots.slice(0, 4).map((color, i) => (
                    <span
                      key={i}
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </span>
                {count > 4 ? (
                  <span className="text-[9px] text-muted-foreground">{count}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
