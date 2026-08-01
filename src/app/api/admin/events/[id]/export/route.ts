import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import { ZipArchive } from 'archiver';
import { Readable, PassThrough } from 'stream';
import { resolveReadPath } from '@/lib/storage';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  const event = await prisma.event.findUnique({
      where: { id: id },
      include: { uploads: true }
  });

  if (!event) {
      return new NextResponse('Event not found', { status: 404 });
  }

  // Use a PassThrough stream to pipe archiver data into the Web Response
  const passthrough = new PassThrough();
  // @ts-ignore
  const webStream = Readable.toWeb(passthrough);

  // archiver v8+: class-based API (no longer archiver('zip', opts))
  const archive = new ZipArchive({
      zlib: { level: 0 } // No compression, just store to save CPU
  });

  archive.on('error', (err: Error) => {
      console.error("ZIP engine error:", err);
  });

  archive.pipe(passthrough);

  // Append each file to the archive (primary or replica)
  for (const upload of event.uploads) {
      const filePath = resolveReadPath(upload.relativePath);
      if (filePath && fs.existsSync(filePath)) {
          archive.file(filePath, { name: upload.originalName || upload.storedName });
      }
  }

  // Finalize archive (closes stream)
  archive.finalize();

  return new NextResponse(webStream as any, {
      headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="event-${id}-export.zip"`,
      }
  });
}
