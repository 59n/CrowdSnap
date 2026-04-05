import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { REPLICA_PATH } from '@/lib/storage';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

  if (!upload || upload.eventId !== eventId) {
    return new NextResponse('Not found', { status: 404 });
  }

  const thumbPath = path.join(BASE_PATH, 'events', eventId, 'thumbs', `${uploadId}.jpg`);
  const originalPath = path.join(BASE_PATH, upload.relativePath);

  // Replica fallbacks (if primary SSD is missing a file but replica has it)
  const replicaThumbPath = REPLICA_PATH
    ? path.join(REPLICA_PATH, 'events', eventId, 'thumbs', `${uploadId}.jpg`)
    : null;
  const replicaOriginalPath = REPLICA_PATH
    ? path.join(REPLICA_PATH, upload.relativePath)
    : null;

  const effectiveThumb =
    fs.existsSync(thumbPath) ? thumbPath :
    replicaThumbPath && fs.existsSync(replicaThumbPath) ? replicaThumbPath :
    null;

  const effectiveOriginal =
    fs.existsSync(originalPath) ? originalPath :
    replicaOriginalPath && fs.existsSync(replicaOriginalPath) ? replicaOriginalPath :
    null;

  // Serve existing thumbnail
  if (effectiveThumb) {
    const buffer = fs.readFileSync(effectiveThumb);
    return new NextResponse(buffer, {
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
      fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
      fs.writeFileSync(thumbPath, thumbBuffer);
      return new NextResponse(thumbBuffer, {
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
