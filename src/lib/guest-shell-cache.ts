/** Short reuse of the guest page shell so a rush of guests does not each hit Postgres and the disk. */

export const GUEST_SHELL_TTL_MS = 30_000;

export type GuestShellEvent = {
  id: string;
  name: string;
  description: string | null;
  date: Date;
  endDate: Date | null;
  language: string;
  isActive: boolean;
  archivedAt: Date | null;
  guestGalleryEnabled: boolean;
  slug: string | null;
};

export type GuestShell = {
  event: GuestShellEvent;
  hasCoverImage: boolean;
  hasBannerImage: boolean;
  coverCacheKey: number;
  bannerCacheKey: number;
};

type Entry = { at: number; shell: GuestShell };

const byKey = new Map<string, Entry>();
const keysByEvent = new Map<string, Set<string>>();

export function readGuestShell(lookupKey: string, now = Date.now()): GuestShell | null {
  const entry = byKey.get(lookupKey);
  if (!entry) return null;
  if (now - entry.at > GUEST_SHELL_TTL_MS) {
    invalidateGuestShell(entry.shell.event.id);
    return null;
  }
  return entry.shell;
}

export function writeGuestShell(lookupKey: string, shell: GuestShell, now = Date.now()) {
  const keys = keysByEvent.get(shell.event.id) ?? new Set<string>();
  keys.add(lookupKey);
  keys.add(shell.event.id);
  keysByEvent.set(shell.event.id, keys);
  const entry = { at: now, shell };
  for (const key of keys) byKey.set(key, entry);
}

export function invalidateGuestShell(eventId: string) {
  const keys = keysByEvent.get(eventId);
  if (keys) {
    for (const key of keys) byKey.delete(key);
  }
  keysByEvent.delete(eventId);
  byKey.delete(eventId);
}

export function invalidateAllGuestShells() {
  byKey.clear();
  keysByEvent.clear();
}
