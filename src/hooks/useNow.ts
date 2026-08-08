"use client";

import * as React from "react";

/**
 * A `Date` that actually advances.
 *
 * The views computed "now" once during render, so the red Now line froze at
 * whatever time the page loaded — which for a home-screen PWA left open all day
 * meant it was wrong for hours. Ticking on an interval fixes the open case;
 * re-reading on `visibilitychange` fixes the more common one, where iOS
 * suspends the app entirely and no timer fires until it comes back.
 */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);

  return now;
}
