"use client";

import * as React from "react";
import { UserButton } from "@clerk/nextjs";
import { BottomNav } from "@/components/bottom-nav";
import { BlockEditorSheet } from "@/components/block-editor/block-editor-sheet";
import { OccurrenceEditorSheet } from "@/components/block-editor/occurrence-editor-sheet";
import { useToast } from "@/components/ui/toast";
import { apiFetch, ApiClientError } from "@/lib/client";
import { toDateKey } from "@/lib/time";
import type { Category, OccurrenceView } from "@/types";

interface EditorTarget {
  blockId?: string; // present when editing an existing series
  prefillDate?: string; // YYYY-MM-DD default date for a new block
}

interface AppContextValue {
  categories: Category[];
  categoriesLoading: boolean;
  refreshCategories: () => Promise<void>;
  refreshKey: number;
  bumpRefresh: () => void;
  openEditor: (target?: EditorTarget) => void;
  openOccurrenceEditor: (occ: OccurrenceView) => void;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppShell");
  return ctx;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = React.useState(true);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editorTarget, setEditorTarget] = React.useState<EditorTarget>({});
  const [occEditorOpen, setOccEditorOpen] = React.useState(false);
  const [occTarget, setOccTarget] = React.useState<OccurrenceView | null>(null);

  const bumpRefresh = React.useCallback(() => setRefreshKey((k) => k + 1), []);

  const refreshCategories = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ categories: Category[] }>("/api/categories");
      setCategories(data.categories);
    } catch (e) {
      if (e instanceof ApiClientError && e.status !== 401) {
        toast("Could not load categories.", "error");
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    refreshCategories();
  }, [refreshCategories]);

  const openEditor = React.useCallback((target?: EditorTarget) => {
    setEditorTarget(target ?? { prefillDate: toDateKey(new Date()) });
    setEditorOpen(true);
  }, []);

  const openOccurrenceEditor = React.useCallback((occ: OccurrenceView) => {
    setOccTarget(occ);
    setOccEditorOpen(true);
  }, []);

  const value: AppContextValue = {
    categories,
    categoriesLoading,
    refreshCategories,
    refreshKey,
    bumpRefresh,
    openEditor,
    openOccurrenceEditor,
  };

  return (
    <AppContext.Provider value={value}>
      <div className="app-shell mx-auto flex min-h-svh w-full max-w-lg flex-col pb-24">
        <header className="app-chrome safe-top sticky top-0 z-30 flex items-center justify-between bg-background/95 px-4 pb-2 backdrop-blur">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            Rhythm
          </span>
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </header>
        <main className="flex-1">{children}</main>
      </div>

      <BottomNav onAdd={() => openEditor()} />

      <BlockEditorSheet
        open={editorOpen}
        onOpenChange={setEditorOpen}
        target={editorTarget}
      />
      <OccurrenceEditorSheet
        open={occEditorOpen}
        onOpenChange={setOccEditorOpen}
        occurrence={occTarget}
      />
    </AppContext.Provider>
  );
}
