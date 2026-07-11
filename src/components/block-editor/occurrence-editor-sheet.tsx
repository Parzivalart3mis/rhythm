"use client";

import * as React from "react";
import { Pencil, CalendarX, CalendarClock, Trash2, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApp } from "@/components/app-shell";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiClientError } from "@/lib/client";
import { formatTime12 } from "@/lib/time";
import type { OccurrenceView } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  occurrence: OccurrenceView | null;
}

export function OccurrenceEditorSheet({ open, onOpenChange, occurrence }: Props) {
  const { openEditor, bumpRefresh } = useApp();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [mode, setMode] = React.useState<"actions" | "reschedule" | "confirmDelete">(
    "actions"
  );
  const [resDate, setResDate] = React.useState("");
  const [resStart, setResStart] = React.useState("");
  const [resEnd, setResEnd] = React.useState("");

  React.useEffect(() => {
    if (open && occurrence) {
      setMode("actions");
      setResDate(occurrence.date);
      setResStart(occurrence.startTime ?? "09:00");
      setResEnd(occurrence.endTime ?? "10:00");
    }
  }, [open, occurrence]);

  if (!occurrence) return null;
  const occ = occurrence;
  const isRecurring = occ.isRecurring;

  async function applyException(body: Record<string, unknown>, successMsg: string) {
    setBusy(true);
    try {
      await apiFetch(`/api/blocks/${occ.blockId}/occurrence`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast(successMsg, "success");
      bumpRefresh();
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Could not update.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSeries() {
    setBusy(true);
    try {
      await apiFetch(`/api/blocks/${occ.blockId}`, { method: "DELETE" });
      toast("Series deleted.", "success");
      bumpRefresh();
      onOpenChange(false);
    } catch (e) {
      toast(e instanceof ApiClientError ? e.message : "Could not delete.", "error");
    } finally {
      setBusy(false);
    }
  }

  const timeLabel =
    occ.startTime && occ.endTime
      ? `${formatTime12(occ.startTime)}–${formatTime12(occ.endTime)}`
      : "Flexible task";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={occ.title} description={timeLabel}>
        {mode === "actions" ? (
          <div className="space-y-2 pb-2">
            <ActionRow
              icon={Pencil}
              label="Edit series"
              hint="Change the whole recurring block"
              onClick={() => {
                onOpenChange(false);
                openEditor({ blockId: occ.blockId });
              }}
            />
            {isRecurring ? (
              <>
                <ActionRow
                  icon={CalendarClock}
                  label="Move just this one"
                  hint="Reschedule this occurrence only"
                  onClick={() => setMode("reschedule")}
                />
                <ActionRow
                  icon={CalendarX}
                  label="Skip just this one"
                  hint="Hide this single occurrence"
                  disabled={busy}
                  onClick={() =>
                    applyException(
                      { occurrenceDate: occ.date, exceptionType: "skip" },
                      "Occurrence skipped."
                    )
                  }
                />
              </>
            ) : null}
            <ActionRow
              icon={Trash2}
              label="Delete series"
              hint="Remove this block and all occurrences"
              destructive
              onClick={() => setMode("confirmDelete")}
            />
          </div>
        ) : null}

        {mode === "reschedule" ? (
          <div className="space-y-4 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="res-date">New date</Label>
              <Input
                id="res-date"
                type="date"
                value={resDate}
                onChange={(e) => setResDate(e.target.value)}
              />
            </div>
            {occ.startTime ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="res-start">Start</Label>
                  <Input
                    id="res-start"
                    type="time"
                    value={resStart}
                    onChange={(e) => setResStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-end">End</Label>
                  <Input
                    id="res-end"
                    type="time"
                    value={resEnd}
                    onChange={(e) => setResEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMode("actions")}
                disabled={busy}
              >
                Back
              </Button>
              <Button
                className="flex-1"
                disabled={busy}
                onClick={() =>
                  applyException(
                    {
                      occurrenceDate: occ.date,
                      exceptionType: "reschedule",
                      newDate: resDate !== occ.date ? resDate : undefined,
                      newStartTime: occ.startTime ? resStart : undefined,
                      newEndTime: occ.startTime ? resEnd : undefined,
                    },
                    "Occurrence moved."
                  )
                }
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Move
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "confirmDelete" ? (
          <div className="space-y-4 pb-4">
            <p className="text-sm text-muted-foreground">
              Delete <span className="font-medium text-foreground">{occ.title}</span>{" "}
              and all of its occurrences? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setMode("actions")}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                onClick={deleteSeries}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                Delete
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ActionRow({
  icon: Icon,
  label,
  hint,
  onClick,
  destructive,
  disabled,
}: {
  icon: typeof Pencil;
  label: string;
  hint: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-3 text-left transition-colors hover:bg-surface-offset disabled:opacity-50"
    >
      <Icon className={destructive ? "size-5 text-error" : "size-5 text-primary"} />
      <span className="flex flex-col">
        <span
          className={
            destructive
              ? "text-sm font-medium text-error"
              : "text-sm font-medium text-foreground"
          }
        >
          {label}
        </span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}
