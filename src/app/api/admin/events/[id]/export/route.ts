import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import { ZipArchive } from 'archiver';
import { Readable, PassThrough } from 'stream';
import { resolveReadPath } from '@/lib/storage';
import { sanitizeZipEntryName } from '@/lib/zip-names';
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

  const event = await prisma.event.findUnique({
    where: { id },
    include: { uploads: true },
  });

  if (!event) {
    return new NextResponse('Event not found', { status: 404 });
  }

  const passthrough = new PassThrough();
  
  const webStream = Readable.toWeb(passthrough);

  const archive = new ZipArchive({
    zlib: { level: 0 },
  });

  archive.on('error', (err: Error) => {
    console.error('ZIP engine error:', err);
  });

  archive.pipe(passthrough);

  const usedNames = new Set<string>();
  for (const upload of event.uploads) {
    const filePath = resolveReadPath(upload.relativePath);
    if (filePath && fs.existsSync(filePath)) {
      const name = sanitizeZipEntryName(
        upload.originalName,
        upload.storedName,
        usedNames
      );
      archive.file(filePath, { name });
    }
  }

  archive.finalize();

  return new NextResponse(webStream as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="event-${id}-export.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
