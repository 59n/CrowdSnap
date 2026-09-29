import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import prisma from '@/lib/db';
import {
  getFilePath,
  initEventStorage,
  scheduleMirror,
  mirrorToOtherSide,
  isSafeEventId,
  safeUnlink,
  getPrimaryPath,
  getReplicaPath,
} from '@/lib/storage';
import { detectMediaType } from '@/lib/file-type';
import { invalidateGuestShell } from '@/lib/guest-shell-cache';
import sharp from 'sharp';
import path from 'path';

const MAX_BANNER_BYTES = 12 * 1024 * 1024; // 12 MB

function bannerRel(eventId: string, name: string) {
  return `events/${eventId}/metadata/${name}`;
}

function removeBannerFiles(eventId: string) {
  const primary = getPrimaryPath();
  const replica = getReplicaPath();
  for (const name of ['banner.bin', 'banner_meta.json'] as const) {
    const rel = bannerRel(eventId, name);
    safeUnlink(path.join(primary, rel));
    if (replica) safeUnlink(path.join(replica, rel));
  }
}

/** Upload full-width guest page hero/banner background. */
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
    if (file.size > MAX_BANNER_BYTES) {
      return NextResponse.json({ error: 'Banner image too large (max 12MB)' }, { status: 413 });
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

    // Wide landscape-friendly JPEG for full-bleed hero
    const bannerJpeg = await sharp(buffer)
      .rotate()
      .resize({
        width: 1920,
        height: 1080,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();

    const bannerPath = getFilePath(id, 'metadata', 'banner.bin');
    const bannerTmp = bannerPath + '.tmp';
    fs.writeFileSync(bannerTmp, bannerJpeg);
    fs.renameSync(bannerTmp, bannerPath);
    try {
      mirrorToOtherSide(bannerPath, bannerRel(id, 'banner.bin'), false);
    } catch {
      scheduleMirror(bannerPath, bannerRel(id, 'banner.bin'), false);
    }

    const metaPath = getFilePath(id, 'metadata', 'banner_meta.json');
    const metaBuf = Buffer.from(
      JSON.stringify({ mimeType: 'image/jpeg', updatedAt: Date.now() })
    );
    const metaTmp = metaPath + '.tmp';
    fs.writeFileSync(metaTmp, metaBuf);
    fs.renameSync(metaTmp, metaPath);
    try {
      mirrorToOtherSide(metaPath, bannerRel(id, 'banner_meta.json'), false);
    } catch {
      scheduleMirror(metaPath, bannerRel(id, 'banner_meta.json'), false);
    }

    invalidateGuestShell(id);
    return NextResponse.json({ success: true, v: Date.now() });
  } catch (error) {
    console.error('Error uploading banner image:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** Remove guest page banner background. */
export async function DELETE(
  _request: Request,
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
    removeBannerFiles(id);
    invalidateGuestShell(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting banner image:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
