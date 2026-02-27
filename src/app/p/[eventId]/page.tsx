import UploadZone from "@/components/UploadZone";
import prisma from '@/lib/db';
import { notFound } from "next/navigation";
import { Camera } from "lucide-react";
import fs from "fs";
import { getFilePath } from "@/lib/storage";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { TranslationProvider } from "@/components/TranslationProvider";
import { getDictionary } from "@/lib/i18n";
import { cookies } from "next/headers";

interface PageProps {
  params: {
    eventId: string;
  };
}

export default async function GuestEventPage({ params }: PageProps) {
  const { eventId } = await params;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event || !event.isActive) {
    notFound();
  }

  const hasCoverImage = fs.existsSync(getFilePath(eventId, 'metadata', 'cover.bin'));
  
  const cookieStore = await cookies();
  const cookieName = `NEXT_LOCALE_GUEST_${eventId}`;
  const cookieLocale = cookieStore.get(cookieName)?.value;
  const lang = cookieLocale || event.language || 'en';
  const dictionary = await getDictionary(lang as any);

  return (
    <TranslationProvider initialDictionary={dictionary} initialLocale={lang} cookieName={cookieName}>
      <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
        {/* Decorative background elements */}
        <div className="absolute top-0 -left-40 w-96 h-96 bg-primary/20 blur-[100px] rounded-full pointer-events-none z-0" />
        <div className="absolute bottom-0 -right-40 w-96 h-96 bg-primary/20 blur-[100px] rounded-full pointer-events-none z-0" />
      
      {/* Language Switcher header */}
      <header className="absolute top-0 w-full p-4 flex justify-end z-20">
        <LanguageSwitcher />
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-2xl text-center mb-10 space-y-4">
          {hasCoverImage ? (
            <div className="inline-flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full overflow-hidden border-4 border-background shadow-xl mb-4 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/p/${eventId}/cover`} alt="Event Cover" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-2">
              <Camera className="w-8 h-8 text-primary" />
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight px-2 break-words">
            {event.name}
          </h1>
          <p className="text-muted-foreground text-base md:text-lg max-w-lg mx-auto px-4 mt-2">
            {event.description || dictionary.guest.defaultDescription}
          </p>
        </div>

        <UploadZone eventId={eventId} />
      </main>
    </div>
    </TranslationProvider>
  );
}
