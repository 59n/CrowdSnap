import prisma from '@/lib/db';
import { notFound } from "next/navigation";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Download, ExternalLink, QrCode } from "lucide-react";
import Link from "next/link";
import QRExportWidget from "./QRExportWidget";
import UploadGrid from "./UploadGrid";
import EditEventDialog from "./EditEventDialog";
import { getDictionary, getLocale } from "@/lib/i18n";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const dict = await getDictionary(locale);
  const t = dict.eventDetail;
  const tAdmin = dict.admin;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      uploads: {
        orderBy: { createdAt: "desc" }
      }
    }
  });

  if (!event) {
    notFound();
  }

  const uploadUrl = `${process.env.NEXTAUTH_URL}/p/${event.id}`;
  const totalSizeMB = event.uploads.reduce((acc: number, curr: any) => acc + curr.size, 0) / (1024 * 1024);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="rounded-full flex-shrink-0">
            <Link href="/admin">
              <ArrowLeft className="w-5 h-5" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight truncate">{event.name}</h1>
            <p className="text-muted-foreground flex items-center gap-2 mt-1 text-xs sm:text-sm flex-wrap">
              {format(new Date(event.date), "MMMM d, yyyy")}
              <span className="w-1 h-1 rounded-full bg-muted-foreground hidden sm:inline-block"></span>
              {event.isActive ? tAdmin.active : tAdmin.inactive}
            </p>
            {event.description && (
              <p className="text-sm text-foreground/80 mt-2 max-w-2xl bg-muted/40 p-2 sm:p-3 rounded-md border border-border/50">
                {event.description}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-12 sm:ml-0">
          <EditEventDialog event={event} />
          <Button variant="outline" size="sm" asChild className="flex-1 sm:flex-none">
            <Link href={`/p/${event.id}`} target="_blank">
               <ExternalLink className="w-4 h-4 mr-2" /> {t.guestView}
            </Link>
          </Button>
          <Button size="sm" asChild disabled={event.uploads.length === 0} className="flex-1 sm:flex-none">
            <a href={`/api/admin/events/${event.id}/export`} download>
               <Download className="w-4 h-4 mr-2" /> {t.export}
            </a>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <QrCode className="w-5 h-5" /> {t.guestQrCode}
            </CardTitle>
            <CardDescription>{t.guestQrDesc}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <QRExportWidget url={uploadUrl} />
            <div className="w-full flex-1 space-y-2 mt-2 sm:mt-0">
              <p className="text-sm font-medium text-center sm:text-left">{t.directLink}</p>
              <div className="px-3 py-3 bg-muted rounded-md text-xs sm:text-sm font-mono break-all selection:bg-primary/20 text-center sm:text-left">
                {uploadUrl}
              </div>
              <p className="text-xs text-muted-foreground mt-2 text-center sm:text-left">
                {t.shareLink}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>{tAdmin.uploads}</CardTitle>
            <CardDescription>{event.uploads.length} {t.files} • {totalSizeMB.toFixed(2)} MB {t.total}</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadGrid uploads={event.uploads} eventId={event.id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
