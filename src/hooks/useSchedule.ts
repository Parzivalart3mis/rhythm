"use client";

import * as React from "react";
import { useApp } from "@/components/app-shell";
import { apiFetch, ApiClientError } from "@/lib/client";
import type { OccurrenceView } from "@/types";
import type { ViewMode } from "@/lib/view-range";

interface ScheduleState {
  occurrences: OccurrenceView[];
  range: { start: string; end: string } | null;
  loading: boolean;
  error: string | null;
}

/** Fetch expanded occurrences for a view+date, refetching on global refreshKey. */
export function useSchedule(view: ViewMode, dateKey: string) {
  const { refreshKey } = useApp();
  const [state, setState] = React.useState<ScheduleState>({
    occurrences: [],
    range: null,
    loading: true,
    error: null,
  });

  React.useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch<{ range: { start: string; end: string }; occurrences: OccurrenceView[] }>(
      `/api/blocks?view=${view}&date=${dateKey}`
    )
      .then((data) => {
        if (cancelled) return;
        setState({
          occurrences: data.occurrences,
          range: data.range,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        const msg =
          e instanceof ApiClientError ? e.message : "Could not load your schedule.";
        setState({ occurrences: [], range: null, loading: false, error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [view, dateKey, refreshKey]);

  return state;
}
