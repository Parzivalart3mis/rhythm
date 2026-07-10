import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Uniform error shape across all routes: { error: { code, message } }.
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "rate_limited"
  | "conflict"
  | "server_error";

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function unauthorized() {
  return apiError("unauthorized", "Sign in required.", 401);
}

export function forbidden() {
  return apiError("forbidden", "You do not have access to this resource.", 403);
}

export function notFound(message = "Not found.") {
  return apiError("not_found", message, 404);
}

export function rateLimited() {
  return apiError("rate_limited", "Too many requests. Try again later.", 429);
}

export function serverError(message = "Something went wrong.") {
  return apiError("server_error", message, 500);
}

export function validationError(err: ZodError) {
  const first = err.issues[0];
  const path = first?.path.join(".");
  const message = first ? `${path ? `${path}: ` : ""}${first.message}` : "Invalid input.";
  return apiError("validation_error", message, 422);
}

/** Parse + validate a JSON body, returning either data or a ready error response. */
export async function parseBody<T>(
  req: Request,
  schema: { parse: (v: unknown) => T }
): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { error: apiError("validation_error", "Invalid JSON body.", 422) };
  }
  try {
    return { data: schema.parse(json) };
  } catch (e) {
    if (e instanceof ZodError) return { error: validationError(e) };
    throw e;
  }
}
