"use client";

import * as React from "react";
import { Plus, Trash2, Check, X, Loader2 } from "lucide-react";
import { useApp } from "@/components/app-shell";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/client";
import { CATEGORY_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { Category } from "@/types";

export function CategoryManager() {
  const { categories, categoriesLoading, refreshCategories } = useApp();
  const { toast } = useToast();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  return (
    <div className="space-y-2">
      {categoriesLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        categories.map((c) =>
          editingId === c.id ? (
            <CategoryForm
              key={c.id}
              initial={c}
              busy={busy}
              onCancel={() => setEditingId(null)}
              onSave={async (name, colorHex) => {
                setBusy(true);
                try {
                  await apiFetch(`/api/categories/${c.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ name, colorHex }),
                  });
                  await refreshCategories();
                  setEditingId(null);
                  toast("Category updated.", "success");
                } catch (e) {
                  toast(
                    e instanceof ApiClientError ? e.message : "Could not update.",
                    "error"
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <span
                className="size-4 shrink-0 rounded-full"
                style={{ backgroundColor: c.colorHex }}
              />
              <button
                className="flex-1 text-left text-sm font-medium text-foreground"
                onClick={() => setEditingId(c.id)}
              >
                {c.name}
              </button>
              <button
                onClick={async () => {
                  setBusy(true);
                  try {
                    await apiFetch(`/api/categories/${c.id}`, { method: "DELETE" });
                    await refreshCategories();
                    toast("Category deleted.", "success");
                  } catch (e) {
                    toast(
                      e instanceof ApiClientError ? e.message : "Could not delete.",
                      "error"
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
                className="grid size-9 place-items-center rounded-md text-muted-foreground hover:text-error"
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        )
      )}

      {adding ? (
        <CategoryForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (name, colorHex) => {
            setBusy(true);
            try {
              await apiFetch("/api/categories", {
                method: "POST",
                body: JSON.stringify({ name, colorHex }),
              });
              await refreshCategories();
              setAdding(false);
              toast("Category added.", "success");
            } catch (e) {
              toast(
                e instanceof ApiClientError ? e.message : "Could not add.",
                "error"
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add category
        </Button>
      )}
    </div>
  );
}

function CategoryForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: Category;
  busy: boolean;
  onSave: (name: string, colorHex: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [color, setColor] = React.useState(initial?.colorHex ?? CATEGORY_COLORS[0]);

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Category name"
        maxLength={50}
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={cn(
              "size-8 rounded-full border-2 transition-transform",
              color === c ? "scale-110 border-foreground" : "border-transparent"
            )}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          >
            {color === c ? (
              <Check className="mx-auto size-4 text-white" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          <X className="size-4" />
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={() => onSave(name.trim(), color)}
          disabled={busy || !name.trim()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
