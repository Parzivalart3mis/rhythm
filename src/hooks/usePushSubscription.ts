"use client";

import * as React from "react";
import { apiFetch, ApiClientError } from "@/lib/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export type PushStatus =
  | "unsupported"
  | "unconfigured"
  | "default"
  | "denied"
  | "subscribed"
  | "loading";

export function usePushSubscription() {
  const [status, setStatus] = React.useState<PushStatus>("loading");
  const [busy, setBusy] = React.useState(false);
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  const refresh = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setStatus("unsupported");
      return;
    }
    if (!vapidKey) {
      setStatus("unconfigured");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "default");
    } catch {
      setStatus("default");
    }
  }, [vapidKey]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const registerWithServer = React.useCallback(async (sub: PushSubscription) => {
    const json = sub.toJSON();
    await apiFetch("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
    });
  }, []);

  const subscribe = React.useCallback(async () => {
    if (!vapidKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const options: PushSubscriptionOptionsInit = {
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      };

      let sub = await reg.pushManager.subscribe(options);
      try {
        await registerWithServer(sub);
      } catch (err) {
        // 409 means this endpoint is still registered to a different account —
        // e.g. someone else used this browser and never turned reminders off.
        // subscribe() hands back that same existing subscription, so drop it and
        // mint a fresh endpoint the server will accept.
        if (err instanceof ApiClientError && err.status === 409) {
          await sub.unsubscribe();
          sub = await reg.pushManager.subscribe(options);
          await registerWithServer(sub);
        } else {
          throw err;
        }
      }
      setStatus("subscribed");
    } catch {
      setStatus("default");
    } finally {
      setBusy(false);
    }
  }, [vapidKey, registerWithServer]);

  const unsubscribe = React.useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/push/unsubscribe", {
          method: "DELETE",
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setStatus("default");
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, subscribe, unsubscribe, refresh };
}
