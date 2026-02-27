import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import fs from 'fs';
import path from 'path';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await props.params;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { uploads: true }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Delete all physical files
    for (const upload of event.uploads) {
      const originalPath = path.join(BASE_PATH, upload.relativePath);
      const thumbPath = path.join(BASE_PATH, 'events', eventId, 'thumbs', `${upload.id}.jpg`);
      const metaPath = path.join(BASE_PATH, 'events', eventId, 'metadata', `${upload.id}.json`);

      [originalPath, thumbPath, metaPath].forEach(p => {
          if (fs.existsSync(p)) fs.unlinkSync(p);
      });
    }

    // Delete from DB
    await prisma.upload.deleteMany({
      where: { eventId: eventId }
    });

    return NextResponse.json({ success: true, count: event.uploads.length });
  } catch (error) {
    console.error('Error deleting all uploads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
