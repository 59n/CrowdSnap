import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;
  const deviceId = request.headers.get('x-device-id');

  if (!deviceId) {
    return NextResponse.json({ error: 'Missing device identifier' }, { status: 400 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

  if (!upload || upload.eventId !== eventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only the original uploading device can delete
  if (upload.deviceId !== deviceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Delete files from disk (primary + replica)
  const originalPath = path.join(BASE_PATH, upload.relativePath);
  const thumbPath = path.join(BASE_PATH, 'events', eventId, 'thumbs', `${upload.id}.jpg`);
  const metaPath = path.join(BASE_PATH, 'events', eventId, 'metadata', `${upload.id}.json`);

  [originalPath, thumbPath, metaPath].forEach((p) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  // Replica is intentionally never deleted — it's a permanent archive

  try {
    await prisma.upload.delete({ where: { id: uploadId } });
  } catch {
    // Already deleted (e.g. admin removed it first) — treat as success
  }

  return NextResponse.json({ success: true });
}
