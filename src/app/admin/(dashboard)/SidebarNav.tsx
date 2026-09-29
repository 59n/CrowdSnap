"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Plus, Settings, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  exact?: boolean;
}

export default function SidebarNav({
  eventsLabel,
  createLabel,
  telemetryLabel = "Telemetry & Storage",
  settingsLabel = "Settings",
}: {
  eventsLabel: string;
  createLabel: string;
  telemetryLabel?: string;
  settingsLabel?: string;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/admin", label: eventsLabel, icon: <List className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />, exact: true },
    { href: "/admin/telemetry", label: telemetryLabel, icon: <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> },
    { href: "/admin/create", label: createLabel, icon: <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> },
    { href: "/admin/settings", label: settingsLabel, icon: <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" /> },
  ];

  return (
    <nav className="flex flex-row md:flex-col gap-1 sm:gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none touch-pan-x">
      {items.map((item) => {
        const isActive = item.exact ? pathname === item.href : (pathname?.startsWith(item.href) ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 sm:gap-2.5 px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap shrink-0",
              isActive
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/60"
            )}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
