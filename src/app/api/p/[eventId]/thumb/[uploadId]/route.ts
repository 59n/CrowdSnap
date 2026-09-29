import { telemetry } from '@/lib/telemetry';
import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { webStreamFromNode } from '@/lib/web-stream';
import { getPrimaryPath, resolveReadPath, isSafeEventId } from '@/lib/storage';
import { queueImageThumb } from '@/lib/thumb-queue';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';
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

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !isEventOpenForGuests(event)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });
  if (!upload || upload.eventId !== eventId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const thumbPrimary = path.join(getPrimaryPath(), 'events', eventId, 'thumbs', `${uploadId}.jpg`);
  const effectiveThumb = resolveReadPath(`events/${eventId}/thumbs/${uploadId}.jpg`);
  const effectiveOriginal = resolveReadPath(upload.relativePath);

  if (effectiveThumb) {
    return streamJpeg(effectiveThumb);
  }

  if (upload.mimeType.startsWith('image/') && effectiveOriginal) {
    fs.mkdirSync(path.dirname(thumbPrimary), { recursive: true });
    queueImageThumb({
      originalPath: effectiveOriginal,
      thumbPath: thumbPrimary,
      mirrorRelativePath: `events/${eventId}/thumbs/${uploadId}.jpg`,
      isOverflow: false,
    });
  }

  return new NextResponse('No thumbnail', { status: 404 });
}
