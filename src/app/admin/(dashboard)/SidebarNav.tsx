"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { List, Plus, Settings } from "lucide-react";
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
  settingsLabel = "Settings",
}: {
  eventsLabel: string;
  createLabel: string;
  settingsLabel?: string;
}) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/admin", label: eventsLabel, icon: <List className="w-4 h-4" />, exact: true },
    { href: "/admin/create", label: createLabel, icon: <Plus className="w-4 h-4" /> },
    { href: "/admin/settings", label: settingsLabel, icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <nav className="flex flex-row md:flex-col gap-1 mt-1 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
      {items.map((item) => {
        const isActive = item.exact ? pathname === item.href : (pathname?.startsWith(item.href) ?? false);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
