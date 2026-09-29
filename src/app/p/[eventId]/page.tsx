import UploadZone from "@/components/UploadZone";
import GuestGallery from "@/components/GuestGallery";
import GuestEventClosed from "@/components/GuestEventClosed";
import GuestHeroBanner, { GuestHeroIntroProvider } from "@/components/GuestHeroBanner";
import InAppBrowserBanner from "@/components/InAppBrowserBanner";
import { redirect } from "next/navigation";
import { loadGuestShell } from "@/lib/guest-shell";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { TranslationProvider } from "@/components/TranslationProvider";
import { getDictionary, type Locale } from "@/lib/i18n";
import { cookies } from "next/headers";
import { format } from "date-fns";
import { getEventStatus, isEventOpenForGuests } from "@/lib/events";

interface PageProps {
  params: Promise<{
    eventId: string;
  }>;
}

export default async function GuestEventPage({ params }: PageProps) {
  const { eventId } = await params;

  const shell = await loadGuestShell(eventId);
  if (!shell) {
    redirect("/");
  }
  const { event, hasCoverImage, hasBannerImage, coverCacheKey, bannerCacheKey } = shell;

  const cookieStore = await cookies();
  const cookieName = `NEXT_LOCALE_GUEST_${event.id}`;
  const cookieLocale = cookieStore.get(cookieName)?.value;
  const lang = cookieLocale || event.language || "en";
  const dictionary = await getDictionary(lang as Locale);

  // Known event but closed → friendly status page (not 404)
  if (!isEventOpenForGuests(event)) {
    const status = getEventStatus(event);
    const closedStatus =
      status === "active" ? "disabled" : status; // safety: never pass "active"

    return (
      <TranslationProvider
        initialDictionary={dictionary}
        initialLocale={lang}
        cookieName={cookieName}
      >
        <div className="relative">
          <header className="absolute top-0 right-0 z-20 p-4">
            <LanguageSwitcher />
          </header>
          <GuestEventClosed
            eventId={event.id}
            eventName={event.name}
            eventDate={event.date}
            endDate={event.endDate}
            status={closedStatus}
            dictionary={dictionary}
            hasCoverImage={hasCoverImage}
            hasBannerImage={hasBannerImage}
            coverCacheKey={coverCacheKey}
            bannerCacheKey={bannerCacheKey}
          />
        </div>
      </TranslationProvider>
    );
  }

  return (
    <TranslationProvider
      initialDictionary={dictionary}
      initialLocale={lang}
      cookieName={cookieName}
    >
      <GuestHeroIntroProvider enabled={hasBannerImage}>
      <div className="relative min-h-screen flex flex-col bg-background selection:bg-primary/20">
        {/* Full-width hero banner with smooth scroll fade */}
        {hasBannerImage ? (
          <GuestHeroBanner
            eventId={event.id}
            cacheKey={bannerCacheKey}
          />
        ) : (
          <>
            {/* Subtle gradient blobs when no banner */}
            <div className="fixed top-0 -left-48 w-[28rem] h-[28rem] bg-primary/10 blur-[120px] rounded-full pointer-events-none z-0" />
            <div className="fixed bottom-0 -right-48 w-[28rem] h-[28rem] bg-primary/8 blur-[120px] rounded-full pointer-events-none z-0" />
          </>
        )}

        {/* Top bar */}
        <header
          className={`relative z-20 flex justify-end p-4 ${
            hasBannerImage ? "text-white" : ""
          }`}
        >
          <div className={hasBannerImage ? "[&_button]:text-white [&_button]:border-white/30" : ""}>
            <LanguageSwitcher />
          </div>
        </header>

        <main className="relative z-10 flex-1 flex flex-col items-center px-5 pb-16">
          {/* Hero — sits on the banner fade when present */}
          <div
            className={`w-full max-w-xl text-center mb-8 ${
              hasBannerImage ? "guest-hero-copy" : "mt-2"
            }`}
          >
            {hasCoverImage && (
              <div
                className={`inline-flex items-center justify-center w-20 h-20 rounded-full overflow-hidden border-4 shadow-xl mb-5 bg-muted ${
                  hasBannerImage ? "border-background ring-2 ring-black/5" : "border-background"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/p/${event.id}/cover?v=${coverCacheKey}`}
                  alt="Event"
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight px-2 break-words drop-shadow-sm">
              {event.name}
            </h1>

            <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto mt-3 leading-relaxed px-2">
              {event.description || dictionary.guest.defaultDescription}
            </p>

            <p className="text-xs text-muted-foreground/60 mt-2">
              {format(new Date(event.date), "MMMM d, yyyy")}
              {event.endDate && ` – ${format(new Date(event.endDate), "MMMM d, yyyy")}`}
            </p>
          </div>

          {/* In-app browser warning banner (Instagram, FB, TikTok, etc.) */}
          <InAppBrowserBanner />

          {/* Upload zone */}
          <UploadZone eventId={event.id} />

          {event.guestGalleryEnabled && <GuestGallery eventId={event.id} />}
        </main>
      </div>
      </GuestHeroIntroProvider>
    </TranslationProvider>
  );
}
