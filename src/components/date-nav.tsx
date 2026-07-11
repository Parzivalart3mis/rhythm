"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DateNavProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showToday?: boolean;
}

export function DateNav({ label, onPrev, onNext, onToday, showToday = true }: DateNavProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onPrev} aria-label="Previous">
          <ChevronLeft className="size-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onNext} aria-label="Next">
          <ChevronRight className="size-5" />
        </Button>
      </div>
      <h2 className="flex-1 text-center text-base font-semibold text-foreground">
        {label}
      </h2>
      {showToday ? (
        <Button variant="outline" size="sm" onClick={onToday} className="min-h-9">
          Today
        </Button>
      ) : (
        <div className="w-14" />
      )}
    </div>
  );
}
