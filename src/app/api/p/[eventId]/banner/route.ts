import { NextResponse } from 'next/server';
import fs from 'fs';
import { webStreamFromNode } from '@/lib/web-stream';
import { debugLog } from '@/lib/debug-log';
import prisma from '@/lib/db';
import { resolveReadPath, isSafeEventId } from '@/lib/storage';
import { expirePastEvents } from '@/lib/events';

/** Public full-width hero banner for the guest event page. */
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
    if (!event) {
      return new NextResponse(null, { status: 404 });
    }

    const bannerPath = resolveReadPath(`events/${eventId}/metadata/banner.bin`);
    const metaPath = resolveReadPath(`events/${eventId}/metadata/banner_meta.json`);

    if (!bannerPath) {
      debugLog('warn', 'banner.missing', { eventId });
      return new NextResponse(null, {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    let mimeType = 'image/jpeg';
    if (metaPath) {
      try {
        mimeType = JSON.parse(fs.readFileSync(metaPath, 'utf8')).mimeType || mimeType;
      } catch {
        /* banner file alone is enough */
      }
    }
    const stat = fs.statSync(bannerPath);
    const etag = `"b-${stat.mtimeMs.toFixed(0)}-${stat.size}"`;
    // Versioned by ?v=mtime on the page. A slow phone should reuse it, not
    // re-download the whole hero on every visit.
    const cache = 'public, max-age=604800, immutable';

    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': cache },
      });
    }

    const nodeStream = fs.createReadStream(bannerPath);
    const webStream = webStreamFromNode(nodeStream);

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': stat.size.toString(),
        ETag: etag,
        'Cache-Control': cache,
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
