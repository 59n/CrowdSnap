import prisma from '@/lib/db';

export type EventStatus = 'active' | 'disabled' | 'ended' | 'archived';

export type EventLike = {
  isActive: boolean;
  endDate?: Date | string | null;
  archivedAt?: Date | string | null;
};

/**
 * End date is inclusive of that full calendar day (UTC).
 * e.g. endDate = 2026-04-30 → open until 2026-04-30 23:59:59.999 UTC.
 */
export function isPastEndDate(endDate: Date | string | null | undefined): boolean {
  if (!endDate) return false;
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  const endOfDay = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
    23,
    59,
    59,
    999
  );
  return Date.now() > endOfDay;
}

/** Guests may open the page / upload only when all of these pass. */
export function isEventOpenForGuests(event: EventLike): boolean {
  if (event.archivedAt) return false;
  if (!event.isActive) return false;
  if (isPastEndDate(event.endDate)) return false;
  return true;
}

/** Admin-facing effective status badge. */
export function getEventStatus(event: EventLike): EventStatus {
  if (event.archivedAt) return 'archived';
  if (isPastEndDate(event.endDate)) return 'ended';
  if (!event.isActive) return 'disabled';
  return 'active';
}

let lastExpireAt = 0;
const EXPIRE_TTL_MS = 5 * 60 * 1000; // at most once per 5 minutes process-wide

/**
 * Flip isActive → false for events whose endDate has passed.
 * Throttled: not a write on every guest request.
 */
export async function expirePastEvents(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastExpireAt < EXPIRE_TTL_MS) return 0;
  lastExpireAt = now;

  const startOfTodayUtc = new Date(
    Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
      0,
      0,
      0,
      0
    )
  );

  const result = await prisma.event.updateMany({
    where: {
      isActive: true,
      archivedAt: null,
      endDate: { not: null, lt: startOfTodayUtc },
    },
    data: { isActive: false },
  });

  return result.count;
}

/** Test helper */
export function resetExpireThrottle() {
  lastExpireAt = 0;
}
