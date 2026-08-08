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

/** Fetch expanded occurrences for a view+date, refetching on global refreshKey. */
export function useSchedule(view: ViewMode, dateKey: string) {
  const { refreshKey } = useApp();
  const [state, setState] = React.useState<ScheduleState>({
    occurrences: [],
    skipped: [],
    range: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<ScheduleResponse>(`/api/blocks?view=${view}&date=${dateKey}`)
      .then((data) => {
        if (cancelled) return;
        setState({
          occurrences: data.occurrences,
          skipped: data.skipped ?? [],
          range: data.range,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? e.message : "Could not load your schedule.";
        setState({
          occurrences: [],
          skipped: [],
          range: null,
          loading: false,
          error: msg,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [view, dateKey, refreshKey]);

  return state;
}
