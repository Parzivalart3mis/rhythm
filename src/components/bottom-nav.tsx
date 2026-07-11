"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutGrid, CalendarRange, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  onAdd: () => void;
}

const items = [
  { href: "/day", label: "Day", icon: CalendarDays },
  { href: "/week", label: "Week", icon: LayoutGrid },
  { href: "/month", label: "Month", icon: CalendarRange },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function BottomNav({ onAdd }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav app-chrome fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
      <ul className="mx-auto grid max-w-lg grid-cols-5 items-center px-1 pt-1">
        {items.slice(0, 2).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        <li className="flex justify-center">
          <button
            onClick={onAdd}
            aria-label="Add block"
            className="grid size-12 -translate-y-1 place-items-center rounded-full bg-accent text-accent-foreground shadow-md transition-transform active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        </li>

        {items.slice(2).map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof CalendarDays;
  active: boolean;
}) {
  return (
    <li className="flex justify-center">
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
      </Link>
    </li>
  );
}
