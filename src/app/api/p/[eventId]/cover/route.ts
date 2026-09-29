import { NextResponse } from 'next/server';
import fs from 'fs';
import { webStreamFromNode } from '@/lib/web-stream';
import prisma from '@/lib/db';
import { resolveReadPath, isSafeEventId } from '@/lib/storage';
import { expirePastEvents } from '@/lib/events';

export async function GET(
  request: Request,
  props: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await props.params;
  if (!isSafeEventId(eventId)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    await expirePastEvents();
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    // Cover is cosmetic; allow if event exists (closed page may show grayscale cover).
    if (!event) {
      return new NextResponse(null, { status: 404 });
    }

    const coverPath = resolveReadPath(`events/${eventId}/metadata/cover.bin`);
    const metaPath = resolveReadPath(`events/${eventId}/metadata/cover_meta.json`);

    if (!coverPath || !metaPath) {
      return new NextResponse(null, {
        status: 404,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    const { mimeType } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const stat = fs.statSync(coverPath);
    const etag = `"c-${stat.mtimeMs.toFixed(0)}-${stat.size}"`;

    // Revalidate when cover is replaced (same URL path)
    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=0, must-revalidate',
        },
      });
    }

    const nodeStream = fs.createReadStream(coverPath);
    const webStream = webStreamFromNode(nodeStream);

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType || 'image/jpeg',
        'Content-Length': stat.size.toString(),
        ETag: etag,
        'Cache-Control': 'public, max-age=0, must-revalidate',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
