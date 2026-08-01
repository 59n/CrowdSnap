import { NextResponse } from 'next/server';
import fs from 'fs';
import { Readable } from 'stream';
import prisma from '@/lib/db';
import { resolveReadPath, isSafeEventId } from '@/lib/storage';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';

export async function GET(
  _request: Request,
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
    // Optionally hide cover only when archived
    if (event.archivedAt && !isEventOpenForGuests(event)) {
      // still allow for closed status UI branding — keep serving if file exists
    }

    const coverPath = resolveReadPath(`events/${eventId}/metadata/cover.bin`);
    const metaPath = resolveReadPath(`events/${eventId}/metadata/cover_meta.json`);

    if (!coverPath || !metaPath) {
      return new NextResponse(null, { status: 404 });
    }

    const { mimeType } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const stat = fs.statSync(coverPath);
    const nodeStream = fs.createReadStream(coverPath);
    
    const webStream = Readable.toWeb(nodeStream);

    return new NextResponse(webStream as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}
