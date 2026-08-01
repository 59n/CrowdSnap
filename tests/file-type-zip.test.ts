import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMediaType,
  resolveUploadType,
  clampMaxFileSizeMB,
  MAX_MAX_FILE_MB,
  MIN_MAX_FILE_MB,
} from '../src/lib/file-type';
import { sanitizeZipEntryName } from '../src/lib/zip-names';
import { isEventOpenForGuests, getEventStatus, isPastEndDate } from '../src/lib/events';

describe('file-type', () => {
  it('detects jpeg magic', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(detectMediaType(buf), 'image/jpeg');
  });

  it('detects png magic', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.equal(detectMediaType(buf), 'image/png');
  });

  it('rejects unknown with client mime alone', () => {
    const buf = Buffer.alloc(16, 0);
    const r = resolveUploadType('image/jpeg', buf);
    assert.ok('error' in r);
  });

  it('clamps max file size', () => {
    assert.equal(clampMaxFileSizeMB(0), MIN_MAX_FILE_MB);
    assert.equal(clampMaxFileSizeMB(9999), MAX_MAX_FILE_MB);
    assert.equal(clampMaxFileSizeMB(50), 50);
    assert.equal(clampMaxFileSizeMB('nope'), 100);
  });
});

describe('zip-names', () => {
  it('uses basename only', () => {
    const used = new Set<string>();
    assert.equal(sanitizeZipEntryName('../../etc/passwd', 'f.jpg', used), 'passwd');
    assert.equal(sanitizeZipEntryName('a/b/c.jpg', 'f.jpg', used), 'c.jpg');
  });

  it('dedupes collisions', () => {
    const used = new Set<string>();
    assert.equal(sanitizeZipEntryName('photo.jpg', 'x', used), 'photo.jpg');
    assert.equal(sanitizeZipEntryName('photo.jpg', 'x', used), 'photo (1).jpg');
  });
});

describe('events open rules', () => {
  it('blocks archived disabled ended', () => {
    assert.equal(isEventOpenForGuests({ isActive: true, endDate: null, archivedAt: null }), true);
    assert.equal(isEventOpenForGuests({ isActive: false, endDate: null, archivedAt: null }), false);
    assert.equal(
      isEventOpenForGuests({ isActive: true, endDate: null, archivedAt: new Date() }),
      false
    );
    const past = new Date('2020-01-01T00:00:00Z');
    assert.equal(isPastEndDate(past), true);
    assert.equal(isEventOpenForGuests({ isActive: true, endDate: past, archivedAt: null }), false);
    assert.equal(getEventStatus({ isActive: true, endDate: past, archivedAt: null }), 'ended');
  });
});
