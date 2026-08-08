// Thin typed fetch wrapper for the client. Throws ApiClientError on non-2xx so
// callers can surface the server's { error: { code, message } } shape.
export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// A stalled request never rejects on its own, which on a phone handing off
// between wifi and cellular leaves the view on a skeleton indefinitely. Fail
// instead, so the caller's error state and Retry button get a chance to render.
const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  input: string,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Timeout, offline, or a caller-supplied abort — all retryable, none of
    // which produce a response to read a message out of.
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiClientError(
      timedOut ? "timeout" : "network_error",
      timedOut
        ? "That took too long. Check your connection and try again."
        : "Couldn't reach the server. Check your connection and try again.",
      0
    );
  }

  let body: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new ApiClientError(
      err?.code ?? "server_error",
      err?.message ?? "Request failed.",
      res.status
    );
  }

  return body as T;
}
