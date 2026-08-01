import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { getPrimaryPath, resolveReadPath } from '@/lib/storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

  if (!upload || upload.eventId !== eventId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const thumbPrimary = path.join(getPrimaryPath(), 'events', eventId, 'thumbs', `${uploadId}.jpg`);
  const effectiveThumb = resolveReadPath(`events/${eventId}/thumbs/${uploadId}.jpg`);
  const effectiveOriginal = resolveReadPath(upload.relativePath);

  // Serve existing thumbnail
  if (effectiveThumb) {
    const buffer = fs.readFileSync(effectiveThumb);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // No thumb on disk — generate on-the-fly (catches HEIC uploaded before fix)
  if (upload.mimeType.startsWith('image/') && effectiveOriginal) {
    try {
      const imageBuffer = fs.readFileSync(effectiveOriginal);
      const thumbBuffer = await sharp(imageBuffer)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      // Save to primary for future requests
      fs.mkdirSync(path.dirname(thumbPrimary), { recursive: true });
      fs.writeFileSync(thumbPrimary, thumbBuffer);
      return new NextResponse(new Uint8Array(thumbBuffer), {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': thumbBuffer.length.toString(),
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } catch {
      return new NextResponse('No thumbnail', { status: 404 });
    }
  }

  return new NextResponse('No thumbnail', { status: 404 });
}
