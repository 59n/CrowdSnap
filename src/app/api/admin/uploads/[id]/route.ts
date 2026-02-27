import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';

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

    const filePath = path.join(BASE_PATH, upload.relativePath);
    
    if (!fs.existsSync(filePath)) {
      return new NextResponse('File missing on disk', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    // Convert Node stream to Web stream
    // @ts-ignore
    const webStream = Readable.toWeb(fileStream);

    return new NextResponse(webStream as any, {
      headers: {
        'Content-Type': upload.mimeType,
        'Content-Length': stat.size.toString(),
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

    // Delete files from disk
    const originalPath = path.join(BASE_PATH, upload.relativePath);
    const thumbPath = path.join(BASE_PATH, 'events', upload.eventId, 'thumbs', `${upload.id}.jpg`);
    const metaPath = path.join(BASE_PATH, 'events', upload.eventId, 'metadata', `${upload.id}.json`);

    [originalPath, thumbPath, metaPath].forEach(p => {
        if (fs.existsSync(p)) fs.unlinkSync(p);
    });

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
