import { NextResponse } from 'next/server';
import fs from 'fs';
import { resolveReadPath } from '@/lib/storage';

export async function GET(request: Request, props: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await props.params;

  try {
    const coverPath = resolveReadPath(`events/${eventId}/metadata/cover.bin`);
    const metaPath = resolveReadPath(`events/${eventId}/metadata/cover_meta.json`);

    if (!coverPath || !metaPath) {
        return new NextResponse(null, { status: 404 });
    }

    const { mimeType } = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const fileBuffer = fs.readFileSync(coverPath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
