import type { NextResponse } from "next/server";
import { apiError } from "@/lib/api";

/**
 * Guard for the `/api/cron/*` routes, which Clerk treats as public because the
 * external scheduler has no session. Returns a response to send, or null when
 * the caller is allowed through.
 */
export function cronAuthError(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    // Unset in production means the endpoint would be wide open — refuse rather
    // than serve it. Locally, allow a bare curl.
    if (process.env.NODE_ENV === "production") {
      return apiError("server_error", "CRON_SECRET is not configured.", 503);
    }
    return null;
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError("unauthorized", "Invalid cron secret.", 401);
  }
  return null;
}
