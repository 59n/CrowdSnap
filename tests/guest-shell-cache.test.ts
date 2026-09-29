import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  GUEST_SHELL_TTL_MS,
  invalidateAllGuestShells,
  invalidateGuestShell,
  readGuestShell,
  writeGuestShell,
  type GuestShell,
} from '../src/lib/guest-shell-cache';

function shell(id: string, slug: string | null): GuestShell {
  return {
    event: {
      id,
      name: 'Test',
      description: null,
      date: new Date('2026-10-02T12:00:00Z'),
      endDate: null,
      language: 'en',
      isActive: true,
      archivedAt: null,
      guestGalleryEnabled: true,
      slug,
    },
    hasCoverImage: false,
    hasBannerImage: false,
    coverCacheKey: 0,
    bannerCacheKey: 0,
  };
}

describe('guest shell cache', () => {
  it('reuses a shell by id and slug until it is invalidated', () => {
    invalidateAllGuestShells();
    const now = 1_000_000;
    writeGuestShell('my-wedding', shell('evt1', 'my-wedding'), now);
    assert.equal(readGuestShell('my-wedding', now + 1000)?.event.id, 'evt1');
    assert.equal(readGuestShell('evt1', now + 1000)?.event.name, 'Test');
    invalidateGuestShell('evt1');
    assert.equal(readGuestShell('my-wedding', now + 1000), null);
    assert.equal(readGuestShell('evt1', now + 1000), null);
  });

  it('drops a shell after the ttl', () => {
    invalidateAllGuestShells();
    const now = 2_000_000;
    writeGuestShell('evt2', shell('evt2', null), now);
    assert.equal(readGuestShell('evt2', now + GUEST_SHELL_TTL_MS + 1), null);
  });
});
