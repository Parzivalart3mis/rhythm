import webpush from "web-push";

let configured = false;

function configure(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushTarget {
  endpoint: string;
  p256dhKey: string;
  authKey: string;
}

export interface PushPayload {
  title: string;
  body: string;
  blockId: string;
  url?: string;
}

export type SendResult =
  | { ok: true }
  | { ok: false; gone: boolean; error: string };

/**
 * Send one web-push message. `gone` is true when the subscription is expired or
 * invalid (HTTP 404/410) so the caller can prune it.
 */
export async function sendPush(
  target: PushTarget,
  payload: PushPayload
): Promise<SendResult> {
  if (!configure()) {
    return { ok: false, gone: false, error: "VAPID keys not configured" };
  }
  try {
    await webpush.sendNotification(
      {
        endpoint: target.endpoint,
        keys: { p256dh: target.p256dhKey, auth: target.authKey },
      },
      JSON.stringify(payload)
    );
    return { ok: true };
  } catch (err: unknown) {
    const statusCode =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode?: number }).statusCode
        : undefined;
    const gone = statusCode === 404 || statusCode === 410;
    return { ok: false, gone, error: String(err) };
  }
}
