import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import prisma from '@/lib/db';
import { getFilePath, initEventStorage, scheduleMirror, isSafeEventId } from '@/lib/storage';
import { detectMediaType } from '@/lib/file-type';
import sharp from 'sharp';

const MAX_COVER_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await props.params;
  if (!isSafeEventId(id)) {
    return NextResponse.json({ error: 'Invalid event id' }, { status: 400 });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 });
    }
    if (file.size > MAX_COVER_BYTES) {
      return NextResponse.json({ error: 'Cover image too large (max 10MB)' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const magic = detectMediaType(buffer);
    if (!magic || !magic.startsWith('image/')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images are allowed.' },
        { status: 400 }
      );
    }

    initEventStorage(id);

    // Normalize to JPEG cover for consistent serving
    const coverJpeg = await sharp(buffer)
      .rotate()
      .resize({ width: 800, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const coverPath = getFilePath(id, 'metadata', 'cover.bin');
    fs.writeFileSync(coverPath, coverJpeg);
    scheduleMirror(coverPath, `events/${id}/metadata/cover.bin`, false);

    const metaPath = getFilePath(id, 'metadata', 'cover_meta.json');
    const metaBuf = Buffer.from(JSON.stringify({ mimeType: 'image/jpeg' }));
    fs.writeFileSync(metaPath, metaBuf);
    scheduleMirror(metaPath, `events/${id}/metadata/cover_meta.json`, false);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error uploading cover image:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
