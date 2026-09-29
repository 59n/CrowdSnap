import prisma from '@/lib/db';
import { notFound } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, ExternalLink, Download, QrCode } from "lucide-react";
import EventActions from "./EventActions";
import UploadGrid from "./UploadGrid";
import QRExportWidget from "./QRExportWidget";
import EditEventDialog from "./EditEventDialog";
import { getDictionary, getLocale } from "@/lib/i18n";
import { expirePastEvents, getEventStatus, isEventOpenForGuests, type EventStatus } from "@/lib/events";
import fs from "fs";
import { resolveReadPath } from "@/lib/storage";

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

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.eventDetail;
  const tAdmin = dict.admin as Record<string, string>;

  await expirePastEvents();

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      uploads: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: {
        select: { uploads: true },
      },
    },
  });

  if (!event) {
    notFound();
  }

  const initialUploads = event.uploads.map(u => ({
    ...u,
    deviceId: u.deviceId ?? null,
  }));

  const status = getEventStatus(event);
  const guestsOpen = isEventOpenForGuests(event);
  const coverPath = resolveReadPath(`events/${event.id}/metadata/cover.bin`);
  const bannerPath = resolveReadPath(`events/${event.id}/metadata/banner.bin`);
  const hasCoverImage = !!coverPath;
  const hasBannerImage = !!bannerPath;
  const coverCacheKey = hasCoverImage
    ? Math.floor(fs.statSync(coverPath).mtimeMs)
    : 0;
  const bannerCacheKey = hasBannerImage
    ? Math.floor(fs.statSync(bannerPath).mtimeMs)
    : 0;

  const { getSetting } = await import('@/lib/settings');
  const baseUrl = getSetting('NEXTAUTH_URL') || process.env.NEXTAUTH_URL || '';
  const uploadUrl = event.slug ? `${baseUrl}/p/${event.slug}` : `${baseUrl}/p/${event.id}`;
  const originalUrl = `${baseUrl}/p/${event.id}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 justify-between">
        <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
          <Button variant="ghost" size="icon" asChild className="rounded-full mt-0.5 shrink-0 h-8 w-8">
            <Link href="/admin">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight leading-tight">{event.name}</h1>
              <Badge
                variant={status === "active" ? "default" : "secondary"}
                className={`text-[10px] sm:text-[11px] ${statusBadgeClass(status)}`}
              >
                {statusLabel(status, tAdmin)}
              </Badge>
              {!guestsOpen && status === "active" && (
                <Badge variant="secondary" className="text-[10px] sm:text-[11px]">
                  {tAdmin.guestsBlocked ?? "Guests blocked"}
                </Badge>
              )}
              {event.relaxSecurity && (
                <Badge className="text-[10px] sm:text-[11px] bg-amber-500/15 text-amber-800 border-amber-500/30 hover:bg-amber-500/15">
                  {tAdmin.testingModeOn ?? "Rate limits off"}
                </Badge>
              )}
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              {format(new Date(event.date), "MMMM d, yyyy")}
              {event.endDate && ` – ${format(new Date(event.endDate), "MMMM d, yyyy")}`}
            </p>
            {event.description && (
              <p className="text-xs sm:text-sm text-foreground/70 mt-1.5 max-w-xl">
                {event.description}
              </p>
            )}
            <div className="mt-2.5">
              <EventActions eventId={event.id} status={status} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0 shrink-0">
          <EditEventDialog
            event={event}
            hasCoverImage={hasCoverImage}
            hasBannerImage={hasBannerImage}
            coverCacheKey={coverCacheKey}
            bannerCacheKey={bannerCacheKey}
          />
          <Button variant="outline" size="sm" asChild disabled={!guestsOpen} className="flex-1 sm:flex-initial h-8 text-xs">
            <Link href={event.slug ? `/p/${event.slug}` : `/p/${event.id}`} target="_blank">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {t.guestView}
            </Link>
          </Button>
          <Button size="sm" asChild disabled={event._count.uploads === 0} className="flex-1 sm:flex-initial h-8 text-xs">
            <a href={`/api/admin/events/${event.id}/export`} download>
              <Download className="w-3.5 h-3.5 mr-1.5" /> {t.export}
            </a>
          </Button>
        </div>
      </div>

      <Separator className="border-border/50" />

      {/* QR Code */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-4">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
            <QrCode className="w-4 h-4 text-primary" /> {t.guestQrCode}
          </CardTitle>
          <CardDescription className="text-xs">{t.guestQrDesc}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
          <QRExportWidget url={uploadUrl} />
          <div className="w-full flex-1 space-y-2.5 sm:space-y-3 mt-1 sm:mt-0">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-medium">{t.directLink}</p>
              <div className="px-2.5 py-2 sm:px-3 sm:py-2.5 bg-muted rounded-md text-[11px] sm:text-xs font-mono break-all text-muted-foreground border border-border/40">
                {uploadUrl}
              </div>
            </div>
            {event.slug && (
              <div className="space-y-1">
                <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">{t.originalUrl}</p>
                <div className="px-2.5 py-1.5 sm:px-3 sm:py-2 bg-muted/50 rounded-md text-[10px] sm:text-xs font-mono break-all text-muted-foreground/70 border border-border/30">
                  {originalUrl}
                </div>
              </div>
            )}
            <p className="text-[11px] sm:text-xs text-muted-foreground">{t.shareLink}</p>
          </div>
        </CardContent>
      </Card>

      {/* Uploads */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="p-4 pb-2 sm:p-6 sm:pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm sm:text-base">{tAdmin.uploads}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {tAdmin.uploads}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0">
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
