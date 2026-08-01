import prisma from '@/lib/db';
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Download, ExternalLink, QrCode } from "lucide-react";
import Link from "next/link";
import QRExportWidget from "./QRExportWidget";
import UploadGrid from "./UploadGrid";
import EditEventDialog from "./EditEventDialog";
import EventActions from "./EventActions";
import { getDictionary, getLocale } from "@/lib/i18n";
import { expirePastEvents, getEventStatus, isEventOpenForGuests } from "@/lib/events";

function statusBadgeClass(status: string) {
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

function statusLabel(status: string, tAdmin: Record<string, string>) {
  switch (status) {
    case "active":
      return tAdmin.active;
    case "ended":
      return tAdmin.ended ?? "Ended";
    case "archived":
      return tAdmin.archived ?? "Archived";
    default:
      return tAdmin.inactive;
  }
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.eventDetail;
  const tAdmin = dict.admin as Record<string, string>;

  await expirePastEvents();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      _count: { select: { uploads: true } },
    },
  });

  if (!event) {
    notFound();
  }

  // First page only — full history loaded client-side via paginated API
  const initialUploads = await prisma.upload.findMany({
    where: { eventId: id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      deviceId: true,
    },
  });

  const status = getEventStatus(event);
  const guestsOpen = isEventOpenForGuests(event);

  const { getSetting } = await import('@/lib/settings');
  const baseUrl = getSetting('NEXTAUTH_URL') || process.env.NEXTAUTH_URL || '';
  const uploadUrl = event.slug ? `${baseUrl}/p/${event.slug}` : `${baseUrl}/p/${event.id}`;
  const originalUrl = `${baseUrl}/p/${event.id}`;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" asChild className="rounded-full mt-0.5 shrink-0 h-8 w-8">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">{event.name}</h1>
              <Badge
                variant={status === "active" ? "default" : "secondary"}
                className={`text-[11px] ${statusBadgeClass(status)}`}
              >
                {statusLabel(status, tAdmin)}
              </Badge>
              {!guestsOpen && status === "active" && (
                <Badge variant="secondary" className="text-[11px]">
                  {tAdmin.guestsBlocked ?? "Guests blocked"}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {format(new Date(event.date), "MMMM d, yyyy")}
              {event.endDate && ` – ${format(new Date(event.endDate), "MMMM d, yyyy")}`}
            </p>
            {event.description && (
              <p className="text-sm text-foreground/70 mt-2 max-w-xl">
                {event.description}
              </p>
            )}
            <div className="mt-3">
              <EventActions eventId={event.id} status={status} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-11 sm:ml-0 shrink-0">
          <EditEventDialog event={event} />
          <Button variant="outline" size="sm" asChild disabled={!guestsOpen}>
            <Link href={event.slug ? `/p/${event.slug}` : `/p/${event.id}`} target="_blank">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {t.guestView}
            </Link>
          </Button>
          <Button size="sm" asChild disabled={event._count.uploads === 0}>
            <a href={`/api/admin/events/${event.id}/export`} download>
              <Download className="w-3.5 h-3.5 mr-1.5" /> {t.export}
            </a>
          </Button>
        </div>
      </div>

      <Separator className="border-border/50" />

      {/* QR Code */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="w-4 h-4 text-primary" /> {t.guestQrCode}
          </CardTitle>
          <CardDescription className="text-xs">{t.guestQrDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <QRExportWidget url={uploadUrl} />
          <div className="w-full flex-1 space-y-3 mt-2 sm:mt-0">
            <div className="space-y-1.5">
              <p className="text-sm font-medium">{t.directLink}</p>
              <div className="px-3 py-2.5 bg-muted rounded-md text-xs font-mono break-all text-muted-foreground border border-border/40">
                {uploadUrl}
              </div>
            </div>
            {event.slug && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">{t.originalUrl}</p>
                <div className="px-3 py-2 bg-muted/50 rounded-md text-xs font-mono break-all text-muted-foreground/70 border border-border/30">
                  {originalUrl}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">{t.shareLink}</p>
          </div>
        </CardContent>
      </Card>

      {/* Uploads */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">{tAdmin.uploads}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {tAdmin.uploads}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <UploadGrid
            uploads={initialUploads}
            eventId={event.id}
            maxFileSizeMB={event.maxFileSizeMB}
            totalCount={event._count.uploads}
          />
        </CardContent>
      </Card>
    </div>
  );
}
