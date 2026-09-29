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

function ftyp(brand: string): Buffer {
  const buf = Buffer.alloc(16, 0);
  buf.writeUInt32BE(16, 0);
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand.padEnd(4, ' ').slice(0, 4), 8, 'ascii');
  return buf;
}

describe('file-type', () => {
  it('detects jpeg magic', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(detectMediaType(buf), 'image/jpeg');
  });

  it('detects png magic', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    assert.equal(detectMediaType(buf), 'image/png');
  });

  it('detects iPhone HEVC mp4 ftyp iso5 / iso6', () => {
    assert.equal(detectMediaType(ftyp('iso5')), 'video/mp4');
    assert.equal(detectMediaType(ftyp('iso6')), 'video/mp4');
    assert.equal(detectMediaType(ftyp('iso3')), 'video/mp4');
    assert.equal(detectMediaType(ftyp('iso4')), 'video/mp4');
  });

  it('detects AVIF stills from ftyp avif', () => {
    assert.equal(detectMediaType(ftyp('avif')), 'image/avif');
    assert.equal(detectMediaType(ftyp('avis')), 'image/avif');
  });

  it('detects Android 3gp video', () => {
    assert.equal(detectMediaType(ftyp('3gp4')), 'video/3gpp');
    assert.equal(detectMediaType(ftyp('3g2a')), 'video/3gpp');
  });

  it('detects QuickTime mov from ftyp qt', () => {
    assert.equal(detectMediaType(ftyp('qt  ')), 'video/quicktime');
  });

  it('rejects zip and pdf even if the client claims jpeg', () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    assert.equal(detectMediaType(zip), null);
    assert.ok('error' in resolveUploadType('image/jpeg', zip));

    const pdf = Buffer.from('%PDF-1.4xxxxx');
    assert.equal(detectMediaType(pdf), null);
    assert.ok('error' in resolveUploadType('image/jpeg', pdf));
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
