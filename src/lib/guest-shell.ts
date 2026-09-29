import fs from 'fs';
import prisma from '@/lib/db';
import { expirePastEvents } from '@/lib/events';
import { resolveReadPath } from '@/lib/storage';
import {
  readGuestShell,
  writeGuestShell,
  type GuestShell,
} from '@/lib/guest-shell-cache';

function imageFlags(eventId: string): Pick<
  GuestShell,
  'hasCoverImage' | 'hasBannerImage' | 'coverCacheKey' | 'bannerCacheKey'
> {
  const coverPath = resolveReadPath(`events/${eventId}/metadata/cover.bin`);
  const bannerPath = resolveReadPath(`events/${eventId}/metadata/banner.bin`);
  return {
    hasCoverImage: !!coverPath,
    hasBannerImage: !!bannerPath,
    coverCacheKey: coverPath ? Math.floor(fs.statSync(coverPath).mtimeMs) : 0,
    bannerCacheKey: bannerPath ? Math.floor(fs.statSync(bannerPath).mtimeMs) : 0,
  };
}

export async function loadGuestShell(lookup: string): Promise<GuestShell | null> {
  // Throttled. When an event actually flips closed, the shell cache is cleared.
  await expirePastEvents();

  const cached = readGuestShell(lookup);
  if (cached) {
    // Banner presence is a file on disk. Do not trust a cached "no banner"
    // from a moment the file was mid-write or only on the backup drive.
    return { ...cached, ...imageFlags(cached.event.id) };
  }

  let event = await prisma.event.findUnique({ where: { id: lookup } });
  if (!event) {
    event = await prisma.event.findUnique({ where: { slug: lookup } });
  }
  if (!event) return null;

  const shell: GuestShell = {
    event: {
      id: event.id,
      name: event.name,
      description: event.description,
      date: event.date,
      endDate: event.endDate,
      language: event.language,
      isActive: event.isActive,
      archivedAt: event.archivedAt,
      guestGalleryEnabled: event.guestGalleryEnabled,
      slug: event.slug,
    },
    ...imageFlags(event.id),
  };

  writeGuestShell(lookup, shell);
  return shell;
}
