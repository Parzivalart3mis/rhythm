"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useApp } from "@/components/app-shell";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiClientError } from "@/lib/client";
import { toDateKey } from "@/lib/time";
import { WEEKDAYS, REMINDER_LEAD_OPTIONS } from "@/lib/constants";
import {
  buildRruleString,
  parseRecurrenceState,
  type Frequency,
} from "@/lib/recurrence/rrule-builder";
import type { RawBlock, ConflictingBlock } from "@/types";
import { cn } from "@/lib/utils";
import { formatTime12 } from "@/lib/time";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { blockId?: string; prefillDate?: string };
}

const empty = {
  title: "",
  notes: "",
  categoryId: "",
  blockType: "fixed_time" as "fixed_time" | "flexible_task",
  startTime: "09:00",
  endTime: "10:00",
  date: toDateKey(new Date()),
  frequency: "none" as Frequency,
  weekdays: [] as number[],
  reminderLeadMinutes: 10,
};

export function BlockEditorSheet({ open, onOpenChange, target }: Props) {
  const { categories, bumpRefresh } = useApp();
  const { toast } = useToast();
  const [form, setForm] = React.useState(empty);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [conflicts, setConflicts] = React.useState<ConflictingBlock[]>([]);
  const [liveConflicts, setLiveConflicts] = React.useState<ConflictingBlock[]>([]);
  const isEditing = !!target.blockId;

  // Initialize form when the sheet opens.
  React.useEffect(() => {
    if (!open) return;
    setConflicts([]);
    setLiveConflicts([]);
    const firstCat = categories[0]?.id ?? "";
    if (target.blockId) {
      setLoading(true);
      apiFetch<{ block: RawBlock }>(`/api/blocks/${target.blockId}`)
        .then(({ block }) => {
          const rec = parseRecurrenceState(block.rruleString);
          setForm({
            title: block.title,
            notes: block.notes ?? "",
            categoryId: block.categoryId,
            blockType: block.blockType,
            startTime: block.startTime?.slice(0, 5) ?? "09:00",
            endTime: block.endTime?.slice(0, 5) ?? "10:00",
            date:
              (block.isRecurring ? block.seriesStartDate : block.taskDate) ??
              toDateKey(new Date()),
            frequency: rec.frequency,
            weekdays: rec.weekdays,
            reminderLeadMinutes: block.reminderLeadMinutes,
          });
        })
        .catch(() => toast("Could not load this block.", "error"))
        .finally(() => setLoading(false));
    } else {
      setForm({
        ...empty,
        categoryId: firstCat,
        date: target.prefillDate ?? toDateKey(new Date()),
      });
    }
  }, [open, target.blockId, target.prefillDate, categories, toast]);

  const isRecurring = form.frequency !== "none";

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setConflicts([]);
  }

  function toggleWeekday(i: number) {
    setForm((f) => ({
      ...f,
      weekdays: f.weekdays.includes(i)
        ? f.weekdays.filter((d) => d !== i)
        : [...f.weekdays, i],
    }));
    setConflicts([]);
  }

  // Live conflict preview on the anchor date for timed blocks.
  React.useEffect(() => {
    if (!open || form.blockType !== "fixed_time") {
      setLiveConflicts([]);
      return;
    }
    if (form.startTime >= form.endTime) {
      setLiveConflicts([]);
      return;
    }
    const handle = setTimeout(() => {
      apiFetch<{ conflictingBlocks: ConflictingBlock[] }>(
        "/api/blocks/check-conflicts",
        {
          method: "POST",
          body: JSON.stringify({
            date: form.date,
            startTime: form.startTime,
            endTime: form.endTime,
            excludeBlockId: target.blockId,
          }),
        }
      )
        .then((d) => setLiveConflicts(d.conflictingBlocks))
        .catch(() => setLiveConflicts([]));
    }, 350);
    return () => clearTimeout(handle);
  }, [
    open,
    form.blockType,
    form.date,
    form.startTime,
    form.endTime,
    target.blockId,
  ]);

  function validate(): string | null {
    if (!form.title.trim()) return "Add a title.";
    if (!form.categoryId) return "Pick a category.";
    if (form.blockType === "fixed_time") {
      if (form.startTime >= form.endTime) return "End time must be after start time.";
    }
    if (isRecurring && form.frequency === "weekly" && form.weekdays.length === 0) {
      return "Pick at least one weekday.";
    }
    return null;
  }

  async function submit(force: boolean) {
    const problem = validate();
    if (problem) {
      toast(problem, "error");
      return;
    }
    setSaving(true);
    const rruleString = buildRruleString({
      frequency: form.frequency,
      weekdays: form.weekdays,
    });
    const payload = {
      categoryId: form.categoryId,
      title: form.title.trim(),
      notes: form.notes.trim() || undefined,
      blockType: form.blockType,
      startTime: form.blockType === "fixed_time" ? form.startTime : undefined,
      endTime: form.blockType === "fixed_time" ? form.endTime : undefined,
      taskDate: isRecurring ? undefined : form.date,
      isRecurring,
      rruleString: rruleString ?? undefined,
      seriesStartDate: isRecurring ? form.date : undefined,
      reminderLeadMinutes: form.reminderLeadMinutes,
      force,
    };

    try {
      const path = isEditing ? `/api/blocks/${target.blockId}` : "/api/blocks";
      const method = isEditing ? "PATCH" : "POST";
      const res = await apiFetch<
        | { status: "created" | "updated"; blockId: string }
        | { status: "conflict_warning"; conflictingBlocks: ConflictingBlock[] }
      >(path, { method, body: JSON.stringify(payload) });

      if (res.status === "conflict_warning") {
        setConflicts(res.conflictingBlocks);
        setSaving(false);
        return;
      }
      toast(isEditing ? "Block updated." : "Block added.", "success");
      bumpRefresh();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.message : "Could not save.";
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={isEditing ? "Edit block" : "New block"}>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5 pb-4">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Push Day, Team standup…"
                maxLength={100}
              />
            </div>

            {/* Category swatches */}
            <div className="space-y-1.5">
              <Label>Category</Label>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => {
                  const active = c.id === form.categoryId;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set("categoryId", c.id)}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                        active
                          ? "border-transparent text-white"
                          : "border-border bg-card text-foreground"
                      )}
                      style={active ? { backgroundColor: c.colorHex } : undefined}
                    >
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: c.colorHex }}
                      />
                      {c.name}
                    </button>
                  );
                })}
                {categories.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Add a category in Settings first.
                  </p>
                ) : null}
              </div>
            </div>

            {/* Type toggle */}
            <div className="grid grid-cols-2 gap-2">
              <TypeButton
                active={form.blockType === "fixed_time"}
                onClick={() => set("blockType", "fixed_time")}
                label="Fixed time"
                hint="Has a start and end"
              />
              <TypeButton
                active={form.blockType === "flexible_task"}
                onClick={() => set("blockType", "flexible_task")}
                label="Flexible task"
                hint="No set time"
              />
            </div>

            {/* Times (fixed only) */}
            {form.blockType === "fixed_time" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Start</Label>
                  <Input
                    id="start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => set("startTime", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="end">End</Label>
                  <Input
                    id="end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => set("endTime", e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            {/* Recurrence */}
            <div className="space-y-2 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="repeat">Repeat</Label>
                <Switch
                  id="repeat"
                  checked={isRecurring}
                  onCheckedChange={(checked) =>
                    set("frequency", checked ? "weekly" : "none")
                  }
                />
              </div>

              {isRecurring ? (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-2">
                    <FreqButton
                      active={form.frequency === "weekly"}
                      onClick={() => set("frequency", "weekly")}
                      label="Weekly"
                    />
                    <FreqButton
                      active={form.frequency === "daily"}
                      onClick={() => set("frequency", "daily")}
                      label="Daily"
                    />
                  </div>

                  {form.frequency === "weekly" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((d, i) => {
                        const active = form.weekdays.includes(i);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleWeekday(i)}
                            className={cn(
                              "min-h-11 min-w-11 rounded-md border px-2 text-sm font-medium transition-colors",
                              active
                                ? "border-transparent bg-primary text-primary-foreground"
                                : "border-border bg-background text-foreground"
                            )}
                          >
                            {d}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Date (label depends on recurring) */}
            <div className="space-y-1.5">
              <Label htmlFor="date">{isRecurring ? "Starts on" : "Date"}</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => set("date", e.target.value)}
              />
            </div>

            {/* Reminder */}
            <div className="space-y-1.5">
              <Label>Remind me</Label>
              <div className="flex flex-wrap gap-1.5">
                {REMINDER_LEAD_OPTIONS.map((m) => {
                  const active = form.reminderLeadMinutes === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => set("reminderLeadMinutes", m)}
                      className={cn(
                        "min-h-11 rounded-md border px-3 text-sm font-medium transition-colors",
                        active
                          ? "border-transparent bg-secondary text-secondary-foreground"
                          : "border-border bg-background text-foreground"
                      )}
                    >
                      {m === 0 ? "At start" : `${m} min`}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Optional"
                maxLength={500}
              />
            </div>

            {/* Live conflict preview */}
            {liveConflicts.length > 0 && conflicts.length === 0 ? (
              <ConflictBanner
                tone="warning"
                title="Overlaps another block"
                conflicts={liveConflicts}
              />
            ) : null}

            {/* Blocking conflict from save attempt */}
            {conflicts.length > 0 ? (
              <ConflictBanner
                tone="error"
                title="This overlaps existing blocks"
                conflicts={conflicts}
              />
            ) : null}

            <div className="flex gap-2 pt-1">
              {conflicts.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setConflicts([])}
                    disabled={saving}
                  >
                    Go back
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => submit(true)}
                    disabled={saving}
                  >
                    Save anyway
                  </Button>
                </>
              ) : (
                <Button
                  className="flex-1"
                  onClick={() => submit(false)}
                  disabled={saving || categories.length === 0}
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  {isEditing ? "Save changes" : "Add block"}
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TypeButton({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-start justify-center rounded-lg border px-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card"
      )}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </button>
  );
}

function FreqButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-md border text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-background text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function ConflictBanner({
  tone,
  title,
  conflicts,
}: {
  tone: "warning" | "error";
  title: string;
  conflicts: ConflictingBlock[];
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border p-3 text-sm",
        tone === "error"
          ? "border-error/40 bg-error/10 text-foreground"
          : "border-warning/40 bg-warning/10 text-foreground"
      )}
      role="alert"
    >
      <AlertTriangle
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "error" ? "text-error" : "text-warning"
        )}
      />
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        <ul className="space-y-0.5 text-muted-foreground">
          {conflicts.map((c) => (
            <li key={c.id}>
              {c.title} · {formatTime12(c.startTime)}–{formatTime12(c.endTime)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
