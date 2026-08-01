import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { Readable } from 'stream';
import { getPrimaryPath, resolveReadPath, scheduleMirror, isSafeEventId } from '@/lib/storage';
import { isSafeId } from '@/lib/path-safe';

async function streamJpeg(filePath: string) {
  const nodeStream = fs.createReadStream(filePath);
  const { size } = fs.statSync(filePath);
  const webStream = Readable.toWeb(nodeStream);
  return new NextResponse(webStream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': size.toString(),
      'Cache-Control': 'private, max-age=86400',
    },
  });
}

/**
 * Auth-protected thumbs for admin (including closed/archived events).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; uploadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id: eventId, uploadId } = await params;
  if (!isSafeEventId(eventId) || !isSafeId(uploadId)) {
    return new NextResponse('Not found', { status: 404 });
  }

  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
  if (!event) {
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
    try {
      fs.mkdirSync(path.dirname(thumbPrimary), { recursive: true });
      await sharp(effectiveOriginal)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPrimary);
      scheduleMirror(thumbPrimary, `events/${eventId}/thumbs/${uploadId}.jpg`, false);
      return streamJpeg(thumbPrimary);
    } catch {
      return new NextResponse('No thumbnail', { status: 404 });
    }
  }

  return new NextResponse('No thumbnail', { status: 404 });
}
