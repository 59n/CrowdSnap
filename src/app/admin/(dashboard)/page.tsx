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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t.events}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t.manageEvents}</p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/create">
            <Plus className="w-4 h-4 mr-1.5" />
            {t.createEvent}
          </Link>
        </Button>
      </div>

      {/* Stats bar */}
      {events.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-accent">
                  <FolderOpen className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{counts.all}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.events}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-accent">
                  <Activity className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{counts.active}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.active}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-accent">
                  <Archive className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{counts.archived + counts.ended}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.endedArchived ?? "Ended / archived"}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-accent">
                  <ImageIcon className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold leading-none">{totalUploads}</p>
                  <p className="text-xs text-muted-foreground mt-1">{t.uploads}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      {events.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <Link
              key={f.key}
              href={f.key === "active" ? "/admin" : `/admin?filter=${f.key}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
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

      {/* Events grid */}
      {events.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/5">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-4">
              <ImageIcon className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold">{t.noEventsYet}</h3>
            <p className="text-sm text-muted-foreground max-w-xs text-center mt-1.5 mb-6">
              {t.noEventsDesc}
            </p>
            <Button asChild size="sm">
              <Link href="/admin/create">
                <Plus className="w-4 h-4 mr-1.5" />
                {t.createEvent}
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-2 bg-muted/5">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">
              {t.noEventsInFilter ?? "No events in this filter."}
            </p>
            <Button asChild variant="link" size="sm" className="mt-2">
              <Link href="/admin?filter=all">{t.showAllEvents ?? "Show all events"}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((event) => (
            <Link key={event.id} href={`/admin/events/${event.id}`} className="group block">
              <Card
                className={cn(
                  "h-full flex flex-col border-border/60 transition-all duration-200 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5",
                  event.status === "archived" && "opacity-75"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start gap-2">
                    <CardTitle className="text-base font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {event.name}
                    </CardTitle>
                    <Badge
                      variant={event.status === "active" ? "default" : "secondary"}
                      className={cn(
                        "shrink-0 text-[11px] px-2 py-0.5",
                        statusBadgeClass(event.status)
                      )}
                    >
                      {statusLabel(event.status, t)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                    <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                    {format(new Date(event.date), "MMMM d, yyyy")}
                    {event.endDate && (
                      <span className="text-muted-foreground/70">
                        – {format(new Date(event.endDate), "MMM d, yyyy")}
                      </span>
                    )}
                  </p>
                </CardHeader>
                {event.description && (
                  <CardContent className="pb-3 pt-0">
                    <p className="text-xs text-muted-foreground line-clamp-2">{event.description}</p>
                  </CardContent>
                )}
                <CardContent className="mt-auto pt-0">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-muted/40 px-3 py-2 rounded-md">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      {event._count.uploads} {t.uploads}
                    </span>
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
