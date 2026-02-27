import prisma from '@/lib/db';
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Users, Image as ImageIcon } from "lucide-react";
import { getDictionary, getLocale } from "@/lib/i18n";

export default async function AdminDashboardPage() {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.admin;
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { uploads: true },
      },
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.events}</h1>
          <p className="text-muted-foreground mt-1">{t.manageEvents}</p>
        </div>
        <Button asChild>
          <Link href="/admin/create">
            <Plus className="w-4 h-4 mr-2" />
            {t.createEvent}
          </Link>
        </Button>
      </div>

      {events.length === 0 ? (
        <Card className="border-dashed flex flex-col items-center justify-center h-64 bg-muted/10">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
            <ImageIcon className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium">{t.noEventsYet}</h3>
          <p className="text-sm text-muted-foreground max-w-sm text-center mt-2 mb-6">
            {t.noEventsDesc}
          </p>
          <Button asChild variant="outline">
            <Link href="/admin/create">{t.createEvent}</Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event: any) => (
            <Link key={event.id} href={`/admin/events/${event.id}`}>
              <Card className="hover:border-primary/50 transition-colors h-full flex flex-col cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">
                      {event.name}
                    </CardTitle>
                    {event.isActive ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        {t.active}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                        {t.inactive}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.date), "MMMM d, yyyy")}
                  </p>
                </CardHeader>
                <CardContent className="pt-2 mt-auto">
                  <div className="flex items-center text-sm font-medium text-muted-foreground gap-2 bg-muted/30 p-3 rounded-md">
                    <ImageIcon className="w-4 h-4" />
                    <span>{event._count.uploads} {t.uploads}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
