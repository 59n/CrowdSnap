import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { telemetry } from '../src/lib/telemetry';

describe('telemetry tracker', () => {
  test('tracks inbound and outbound bytes and rates', () => {
    const now = Date.now();
    telemetry.recordInbound(1024 * 1024 * 2, '192.168.1.50');
    telemetry.recordOutbound(1024 * 512, '192.168.1.50');

    const snap = telemetry.getSnapshot(now);
    assert.ok(snap.inbound.totalBytes >= 1024 * 1024 * 2);
    assert.ok(snap.outbound.totalBytes >= 1024 * 512);
    assert.ok(snap.activeGuests >= 1);
  });

  test('records uploads and maintains recent uploads history', () => {
    telemetry.recordUpload({
      id: 'test-upload-uuid',
      eventId: 'test-event-1',
      eventName: 'Test Wedding',
      fileName: 'photo_cake.jpg',
      sizeBytes: 3_500_000,
      mimeType: 'image/jpeg',
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    const snap = telemetry.getSnapshot();
    assert.ok(snap.recentUploads.length > 0);
    const item = snap.recentUploads[0];
    assert.equal(item.fileName, 'photo_cake.jpg');
    assert.equal(item.device, 'iPhone');
    assert.equal(item.eventName, 'Test Wedding');
  });
});
