import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { resolveReadPath } from '@/lib/storage';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const upload = await prisma.upload.findUnique({
      where: { id: id },
    });

    if (!upload) {
      return new NextResponse('File not found', { status: 404 });
    }

    const filePath = resolveReadPath(upload.relativePath);

    if (!filePath) {
      return new NextResponse('File missing on disk', { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': upload.mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const upload = await prisma.upload.findUnique({
      where: { id: id },
    });

    if (!upload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete files from disk (primary + replica)
    const originalPath = path.join(BASE_PATH, upload.relativePath);
    const thumbPath = path.join(BASE_PATH, 'events', upload.eventId, 'thumbs', `${upload.id}.jpg`);
    const metaPath = path.join(BASE_PATH, 'events', upload.eventId, 'metadata', `${upload.id}.json`);

    [originalPath, thumbPath, metaPath].forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });

    // Replica is intentionally never deleted — it's a permanent archive

    // Delete from DB
    await prisma.upload.delete({
        where: { id: id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
