import React from 'react';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import Link from 'next/link';
import { Image, LogOut, Plus, List } from 'lucide-react';
import StorageWidget from './StorageWidget';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { getLocale, getDictionary } from '@/lib/i18n';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    redirect("/admin/login");
  }

  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.admin;

  return (
    <div className="min-h-screen bg-muted/20 flex flex-col md:flex-row">
      <aside className="w-full md:w-64 bg-card border-b md:border-r md:border-b-0 border-border md:min-h-screen px-4 pb-4 pt-4 flex flex-col md:gap-4 md:sticky md:top-0 md:h-screen">
        <div className="flex items-center justify-between px-2 pt-2 pb-4 md:py-4 border-b">
          <div className="flex items-center gap-2">
            <Image className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <span className="font-bold text-base md:text-lg tracking-tight">{t.photoDropAdmin}</span>
          </div>
          <Link href="/api/auth/signout" className="md:hidden flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-md bg-muted/30">
            <LogOut className="w-4 h-4" />
          </Link>
        </div>
        
        <nav className="flex flex-row md:flex-col gap-2 md:gap-1 mt-4 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
          <Link href="/admin" className="flex items-center gap-2 md:gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted text-foreground/80 hover:text-foreground bg-muted/30 md:bg-transparent whitespace-nowrap">
            <List className="w-4 h-4" /> {t.events}
          </Link>
          <Link href="/admin/create" className="flex items-center gap-2 md:gap-3 px-3 py-2 text-sm font-medium rounded-md hover:bg-muted text-foreground/80 hover:text-foreground bg-muted/30 md:bg-transparent whitespace-nowrap">
            <Plus className="w-4 h-4" /> {t.create}
          </Link>
        </nav>
        
        <div className="hidden md:flex flex-col mt-auto gap-4">
            <div className="px-3">
              <StorageWidget />
            </div>
            <div className="px-2 py-4 border-t flex items-center justify-between">
              <Link href="/api/auth/signout" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors">
                  <LogOut className="w-4 h-4" /> {t.signOut}
              </Link>
              <LanguageSwitcher />
            </div>
        </div>
      </aside>

      <main className="flex-1 p-4 sm:p-6 md:p-8 lg:p-12 overflow-x-hidden w-full max-w-[100vw]">
        {children}
      </main>
    </div>
  );
}
