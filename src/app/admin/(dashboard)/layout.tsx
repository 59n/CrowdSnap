import React from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Camera, LogOut } from "lucide-react";
import SidebarNav from "./SidebarNav";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import StorageWidgetLazy from "./StorageWidgetLazy";
import { getLocale, getDictionary } from "@/lib/i18n";
import { Separator } from "@/components/ui/separator";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, locale] = await Promise.all([
    getServerSession(authOptions),
    getLocale(),
  ]);

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const dict = await getDictionary(locale);
  const t = dict.admin;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      <aside className="w-full md:w-60 bg-sidebar border-b md:border-r md:border-b-0 border-sidebar-border md:min-h-screen flex flex-col md:sticky md:top-0 md:h-screen">
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary">
            <Camera className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
            CrowdSnap
          </span>
          <Link
            href="/api/auth/signout"
            className="md:hidden ml-auto p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Link>
        </div>

        <div className="flex-1 px-3 py-3 overflow-y-auto">
          <SidebarNav
            eventsLabel={t.events}
            createLabel={t.create}
            settingsLabel={(dict as { settings?: { nav?: string } }).settings?.nav ?? "Settings"}
          />
        </div>

        <div className="hidden md:flex flex-col gap-3 px-3 pb-4">
          <div className="px-1">
            <StorageWidgetLazy />
          </div>
          <Separator className="bg-sidebar-border" />
          <div className="flex items-center justify-between px-1">
            <Link
              href="/api/auth/signout"
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors py-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              {t.signOut}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-5 sm:p-7 lg:p-10 overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}
