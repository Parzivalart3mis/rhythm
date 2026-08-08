"use client";

import * as React from "react";
import { useApp } from "@/components/app-shell";
import { apiFetch, ApiClientError } from "@/lib/client";
import type { OccurrenceView } from "@/types";
import type { ViewMode } from "@/lib/view-range";

interface ScheduleState {
  occurrences: OccurrenceView[];
  /** Occurrences hidden by a skip exception, so they can be restored. */
  skipped: OccurrenceView[];
  range: { start: string; end: string } | null;
  loading: boolean;
  error: string | null;
}

interface ScheduleResponse {
  range: { start: string; end: string };
  occurrences: OccurrenceView[];
  skipped?: OccurrenceView[];
}

type CacheEntry = Pick<ScheduleState, "occurrences" | "skipped" | "range">;

/**
 * Responses keyed by view+date, kept for the lifetime of the page.
 *
 * Module scope rather than a ref, so paging day → day → back and switching
 * between the three views reuses what was already fetched instead of flashing a
 * skeleton and re-hitting a cold serverless function. Every mutation bumps
 * `refreshKey`, which clears the cache wholesale — a single block edit can
 * change any range (recurring series, reschedules across dates), so there is no
 * safe way to invalidate a subset.
 */
const cache = new Map<string, CacheEntry>();
let cachedFor = 0;

/** Pure lookup — safe to call while rendering. */
function peekCache(key: string, refreshKey: number): CacheEntry | undefined {
  return cachedFor === refreshKey ? cache.get(key) : undefined;
}

/** Drops everything when the data has been mutated. Effects only. */
function invalidateIfStale(refreshKey: number): void {
  if (cachedFor !== refreshKey) {
    cache.clear();
    cachedFor = refreshKey;
  }
}

/**
 * Fetch expanded occurrences for a view+date. Serves a cached range immediately
 * while revalidating in the background, so navigation is instant and still
 * converges on fresh data.
 */
export function useSchedule(view: ViewMode, dateKey: string) {
  const { refreshKey } = useApp();
  const key = `${view}:${dateKey}`;

  const [state, setState] = React.useState<ScheduleState>(() => {
    const hit = peekCache(key, refreshKey);
    return {
      occurrences: hit?.occurrences ?? [],
      skipped: hit?.skipped ?? [],
      range: hit?.range ?? null,
      loading: !hit,
      error: null,
    };
  });

  React.useEffect(() => {
    let cancelled = false;
    invalidateIfStale(refreshKey);
    const hit = peekCache(key, refreshKey);

    // A hit still revalidates, just without the skeleton.
    setState({
      occurrences: hit?.occurrences ?? [],
      skipped: hit?.skipped ?? [],
      range: hit?.range ?? null,
      loading: !hit,
      error: null,
    });

    apiFetch<ScheduleResponse>(`/api/blocks?view=${view}&date=${dateKey}`)
      .then((data) => {
        const entry: CacheEntry = {
          occurrences: data.occurrences,
          skipped: data.skipped ?? [],
          range: data.range,
        };
        cache.set(key, entry);
        if (cancelled) return;
        setState({ ...entry, loading: false, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? e.message : "Could not load your schedule.";
        // Keep showing cached data if we have it — a failed refresh shouldn't
        // blank a view the user is already reading. Still record it; a silently
        // swallowed failure is exactly what makes this kind of bug invisible.
        setState((s) => {
          if (s.range) {
            console.error("Schedule refresh failed, showing cached data:", e);
            return { ...s, loading: false, error: null };
          }
          return {
            occurrences: [],
            skipped: [],
            range: null,
            loading: false,
            error: msg,
          };
        });
      });

    return () => {
      cancelled = true;
    };
  }, [view, dateKey, key, refreshKey]);

  return state;
}
