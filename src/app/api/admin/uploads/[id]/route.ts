import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import { Readable } from 'stream';
import { resolveReadPath, deleteUploadFiles } from '@/lib/storage';
import { isSafeId } from '@/lib/path-safe';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  if (!isSafeId(id)) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return new NextResponse('File not found', { status: 404 });
    }

    const filePath = resolveReadPath(upload.relativePath);
    if (!filePath || !fs.existsSync(filePath)) {
      return new NextResponse('File missing on disk', { status: 404 });
    }

    const stat = fs.statSync(filePath);
    const nodeStream = fs.createReadStream(filePath);
    
    const webStream = Readable.toWeb(nodeStream);

    return new NextResponse(webStream as unknown as BodyInit, {
      headers: {
        'Content-Type': upload.mimeType,
        'Content-Length': stat.size.toString(),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  if (!isSafeId(id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const upload = await prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    deleteUploadFiles(upload.eventId, upload.id, upload.storedName);
    await prisma.upload.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
