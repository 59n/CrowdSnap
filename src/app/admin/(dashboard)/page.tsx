import prisma from '@/lib/db';
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, Image as ImageIcon, CalendarDays, Activity, FolderOpen, Archive } from "lucide-react";
import { getDictionary, getLocale } from "@/lib/i18n";
import { expirePastEvents, getEventStatus, type EventStatus } from "@/lib/events";
import { cn } from "@/lib/utils";

type Filter = "active" | "disabled" | "ended" | "archived" | "all";

function statusBadgeClass(status: EventStatus) {
  switch (status) {
    case "active":
      return "bg-primary/10 text-primary border-primary/20 hover:bg-primary/10";
    case "ended":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20 hover:bg-amber-500/10";
    case "archived":
      return "bg-muted text-muted-foreground border-border hover:bg-muted";
    default:
      return "";
  }
}

function statusLabel(status: EventStatus, labels: Record<string, string>) {
  switch (status) {
    case "active":
      return labels.active;
    case "ended":
      return labels.ended ?? "Ended";
    case "archived":
      return labels.archived ?? "Archived";
    default:
      return labels.inactive;
  }
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.admin as Record<string, string>;
  const sp = await searchParams;
  const filter = (["active", "disabled", "ended", "archived", "all"].includes(sp.filter || "")
    ? sp.filter
    : "active") as Filter;

  await expirePastEvents();

  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { uploads: true },
      },
    },
  });

  const withStatus = events.map((e) => ({
    ...e,
    status: getEventStatus(e),
  }));

  const counts = {
    active: withStatus.filter((e) => e.status === "active").length,
    disabled: withStatus.filter((e) => e.status === "disabled").length,
    ended: withStatus.filter((e) => e.status === "ended").length,
    archived: withStatus.filter((e) => e.status === "archived").length,
    all: withStatus.length,
  };

  const filtered =
    filter === "all"
      ? withStatus
      : withStatus.filter((e) => e.status === filter);

  const totalUploads = events.reduce((sum, e) => sum + e._count.uploads, 0);

  const filters: { key: Filter; label: string; count: number }[] = [
    { key: "active", label: t.active, count: counts.active },
    { key: "disabled", label: t.inactive, count: counts.disabled },
    { key: "ended", label: t.ended ?? "Ended", count: counts.ended },
    { key: "archived", label: t.archived ?? "Archived", count: counts.archived },
    { key: "all", label: t.allEvents ?? "All", count: counts.all },
  ];

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* Header */}
      <div className="flex flex-row justify-between items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{t.events}</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">{t.manageEvents}</p>
        </div>
        <Button asChild size="sm" className="h-8 text-xs sm:text-sm px-3 shrink-0">
          <Link href="/admin/create">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5" />
            {t.createEvent}
          </Link>
        </Button>
      </div>

      {/* Stats bar */}
      {events.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          <Card className="border-border/60">
            <CardContent className="p-3 sm:pt-4 sm:pb-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-md bg-accent shrink-0">
                  <FolderOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold leading-none">{counts.all}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{t.events}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:pt-4 sm:pb-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-md bg-accent shrink-0">
                  <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold leading-none">{counts.active}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{t.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:pt-4 sm:pb-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-md bg-accent shrink-0">
                  <Archive className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold leading-none">{counts.archived + counts.ended}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{t.endedArchived ?? "Ended / archived"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-3 sm:pt-4 sm:pb-4">
              <div className="flex items-center gap-2.5 sm:gap-3">
                <div className="p-1.5 sm:p-2 rounded-md bg-accent shrink-0">
                  <ImageIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-accent-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-xl sm:text-2xl font-bold leading-none">{totalUploads}</p>
                  <p className="text-[11px] sm:text-xs text-muted-foreground mt-1 truncate">{t.uploads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-1 sm:gap-1.5">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={f.key === "active" ? "/admin" : `/admin?filter=${f.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "tabular-nums rounded-full px-1.5 py-0.5 text-[10px]",
                  filter === f.key ? "bg-primary-foreground/20" : "bg-muted"
                )}
              >
                {f.count}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Separator className="border-border/50" />

      {/* Events list */}
      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-center border rounded-lg border-dashed p-4">
          <CalendarDays className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/50 mb-3" />
          <h3 className="text-base sm:text-lg font-medium">{t.noEventsYet}</h3>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mt-1 mb-5">
            {t.noEventsDesc}
          </p>
          <Button asChild size="sm">
            <Link href="/admin/create">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
              {t.createEvent}
            </Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center border rounded-lg border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            {t.noEventsInFilter ?? "No events in this filter."}
          </p>
          <Button variant="link" size="sm" asChild className="mt-2">
            <Link href="/admin">{t.showAllEvents ?? "Show all events"}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
          {filtered.map((event) => {
            const status = event.status;
            return (
              <Card
                key={event.id}
                className={cn(
                  "hover:shadow-md transition-shadow flex flex-col justify-between border-border/80",
                  status === "disabled" && "opacity-60",
                  status === "ended" && "opacity-75",
                  status === "archived" && "opacity-50"
                )}
              >
                <CardHeader className="p-4 pb-2.5 sm:pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base sm:text-lg font-semibold leading-tight">
                      <Link
                        href={`/admin/events/${event.id}`}
                        className="hover:underline focus:outline-hidden focus:ring-2 focus:ring-ring rounded-xs"
                      >
                        {event.name}
                      </Link>
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px] sm:text-xs", statusBadgeClass(status))}
                    >
                      {statusLabel(status, t)}
                    </Badge>
                  </div>
                  {event.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {event.description}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="p-4 pt-1 sm:pt-0 space-y-3 sm:space-y-4">
                  <div className="flex items-center text-xs text-muted-foreground gap-4">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {format(new Date(event.date), "MMM d, yyyy")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5" />
                      {event._count.uploads} {t.uploads}
                    </span>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-8 text-xs" asChild>
                      <Link href={`/admin/events/${event.id}`}>
                        {t.editDetails}
                      </Link>
                    </Button>
                    <Button size="sm" className="flex-1 h-8 text-xs" asChild>
                      <Link
                        href={event.slug ? `/p/${event.slug}` : `/p/${event.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {dict.eventDetail.guestView}
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
