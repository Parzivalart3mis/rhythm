"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Boundary for the schedule views. Without it a render-time throw — a malformed
 * occurrence, an unexpected null time — unmounts the app to a blank screen. In
 * an installed PWA there is no address bar to retry from, so the user has to
 * force-quit; this gives them a way back instead.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // No error tracking is wired up, so the function log is the only record.
    console.error("Schedule view crashed:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-error/10">
        <AlertTriangle className="size-6 text-error" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">
          Something went wrong loading your schedule.
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          Your blocks are safe — this is a display problem. Try again, or switch
          to another view.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={reset}>
        <RefreshCw className="size-4" />
        Try again
      </Button>
      {error.digest ? (
        <p className="text-[10px] tabular-nums text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
