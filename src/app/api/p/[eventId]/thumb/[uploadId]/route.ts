import { telemetry } from '@/lib/telemetry';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { webStreamFromNode } from '@/lib/web-stream';
import { getPrimaryPath, resolveReadPath, isSafeEventId } from '@/lib/storage';
import { queueImageThumb } from '@/lib/thumb-queue';
import { expirePastEvents, isEventOpenForGuests, findEventByIdOrSlug } from '@/lib/events';
import { isSafeId } from '@/lib/path-safe';

async function streamJpeg(filePath: string) {
  const nodeStream = fs.createReadStream(filePath);
  const { size } = fs.statSync(filePath);
  telemetry.recordOutbound(size);
  const webStream = webStreamFromNode(nodeStream);
  return new NextResponse(webStream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': size.toString(),
      // Thumbs are content-addressed by upload id — long cache is safe
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
}

/**
 * Guest-facing thumbs — only while the event is open for guests.
 * Admin closed-event thumbs: /api/admin/events/[id]/thumb/[uploadId]
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;

  if (!isSafeEventId(eventId) || !isSafeId(uploadId)) {
    return new NextResponse('Not found', { status: 404 });
  }

  await expirePastEvents();

  const event = await findEventByIdOrSlug(eventId);
  if (!event || !isEventOpenForGuests(event)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.eventId !== event.id) {
    return new NextResponse('Not found', { status: 404 });
  }

  const thumbPrimary = path.join(getPrimaryPath(), 'events', event.id, 'thumbs', `${uploadId}.jpg`);
  const effectiveThumb = resolveReadPath(`events/${event.id}/thumbs/${uploadId}.jpg`);
  const effectiveOriginal = resolveReadPath(upload.relativePath);

  if (effectiveThumb) {
    return streamJpeg(effectiveThumb);
  }

  if (upload.mimeType.startsWith('image/') && effectiveOriginal) {
    fs.mkdirSync(path.dirname(thumbPrimary), { recursive: true });
    queueImageThumb({
      originalPath: effectiveOriginal,
      thumbPath: thumbPrimary,
      mirrorRelativePath: `events/${event.id}/thumbs/${uploadId}.jpg`,
      isOverflow: false,
    });
  }

  // Not ready yet: try again shortly without caching the miss
  return new NextResponse('Thumbnail pending', {
    status: 503,
    headers: {
      'Retry-After': '1',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}
