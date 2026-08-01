import Link from "next/link";
import { format } from "date-fns";
import { Camera, CalendarOff, PauseCircle, Archive, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventStatus } from "@/lib/events";

type Dict = {
  guest?: Record<string, string>;
};

const STATUS_ICON = {
  ended: CalendarOff,
  disabled: PauseCircle,
  archived: Archive,
  active: Camera,
} as const;

export default function GuestEventClosed({
  eventName,
  eventDate,
  endDate,
  status,
  dictionary,
  hasCoverImage,
  eventId,
}: {
  eventName: string;
  eventDate: Date;
  endDate?: Date | null;
  status: Exclude<EventStatus, "active">;
  dictionary: Dict;
  hasCoverImage: boolean;
  eventId: string;
}) {
  const g = dictionary.guest ?? {};
  const Icon = STATUS_ICON[status] ?? PauseCircle;

  const title =
    status === "ended"
      ? g.eventEndedTitle ?? "This event has ended"
      : status === "archived"
        ? g.eventArchivedTitle ?? "This event is no longer available"
        : g.eventDisabledTitle ?? "Uploads are temporarily closed";

  const message =
    status === "ended"
      ? g.eventEndedDesc ??
        "The upload period for this event is over. Thank you for sharing your photos!"
      : status === "archived"
        ? g.eventArchivedDesc ??
          "This event has been archived by the host and is no longer accepting uploads."
        : g.eventDisabledDesc ??
          "The host has paused uploads for now. Please try again later or ask the host.";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="fixed top-0 -left-48 w-[28rem] h-[28rem] bg-primary/10 blur-[120px] rounded-full pointer-events-none z-0" />
      <div className="fixed bottom-0 -right-48 w-[28rem] h-[28rem] bg-primary/8 blur-[120px] rounded-full pointer-events-none z-0" />

      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 pb-16 pt-12">
        <div className="w-full max-w-md text-center">
          {hasCoverImage ? (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full overflow-hidden border-4 border-background shadow-xl mb-5 bg-muted opacity-80">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/p/${eventId}/cover`}
                alt=""
                className="w-full h-full object-cover grayscale"
              />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-muted rounded-full mb-5 border border-border">
              <Icon className="w-7 h-7 text-muted-foreground" />
            </div>
          )}

          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2">
            {eventName}
          </p>

          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight leading-tight px-2">
            {title}
          </h1>

          <p className="text-muted-foreground text-sm sm:text-base max-w-sm mx-auto mt-3 leading-relaxed px-2">
            {message}
          </p>

          <p className="text-xs text-muted-foreground/50 mt-3">
            {format(new Date(eventDate), "MMMM d, yyyy")}
            {endDate && ` – ${format(new Date(endDate), "MMMM d, yyyy")}`}
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="rounded-full min-w-[10rem]">
              <Link href="/">
                <Home className="w-4 h-4 mr-2" />
                {g.backHome ?? "Back to home"}
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
