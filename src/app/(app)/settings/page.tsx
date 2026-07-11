"use client";

import * as React from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { CategoryManager } from "@/components/category-manager";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { apiFetch } from "@/lib/client";

export default function SettingsPage() {
  const { toast } = useToast();
  const { status, busy, subscribe, unsubscribe } = usePushSubscription();
  const [timezone, setTimezone] = React.useState<string | null>(null);

  // Detect and persist the browser timezone so reminders fire at the right local time.
  React.useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setTimezone(tz);
    apiFetch<{ user: { timezone: string } }>("/api/user")
      .then((data) => {
        if (data.user?.timezone !== tz) {
          return apiFetch("/api/user", {
            method: "PATCH",
            body: JSON.stringify({ timezone: tz }),
          });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8 px-4 py-4">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Appearance
        </h2>
        <ThemeToggle />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Notifications
        </h2>
        <PushControl
          status={status}
          busy={busy}
          onSubscribe={async () => {
            await subscribe();
          }}
          onUnsubscribe={async () => {
            await unsubscribe();
            toast("Reminders turned off.", "info");
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Categories
        </h2>
        <CategoryManager />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Timezone
        </h2>
        <p className="text-sm text-muted-foreground">
          {timezone ?? "Detecting…"}
          <span className="block text-xs">
            Reminders use this timezone. It updates automatically from your device.
          </span>
        </p>
      </section>
    </div>
  );
}

function PushControl({
  status,
  busy,
  onSubscribe,
  onUnsubscribe,
}: {
  status: ReturnType<typeof usePushSubscription>["status"];
  busy: boolean;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
}) {
  if (status === "unsupported") {
    return (
      <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Push notifications aren&apos;t supported in this browser. On iPhone, add
        Rhythm to your home screen first, then open it from there.
      </p>
    );
  }
  if (status === "unconfigured") {
    return (
      <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Push isn&apos;t configured on this deployment yet.
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        Notifications are blocked. Enable them for Rhythm in your device settings,
        then reopen the app.
      </p>
    );
  }
  if (status === "subscribed") {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-success/40 bg-card p-3">
        <span className="flex items-center gap-2 text-sm text-foreground">
          <Bell className="size-4 text-success" />
          Reminders are on
        </span>
        <Button variant="outline" size="sm" onClick={onUnsubscribe} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <BellOff className="size-4" />}
          Turn off
        </Button>
      </div>
    );
  }
  // default / loading
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <span className="flex items-center gap-2 text-sm text-foreground">
        <BellOff className="size-4 text-muted-foreground" />
        Reminders are off
      </span>
      <Button
        size="sm"
        onClick={onSubscribe}
        disabled={busy || status === "loading"}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />}
        Turn on
      </Button>
    </div>
  );
}
