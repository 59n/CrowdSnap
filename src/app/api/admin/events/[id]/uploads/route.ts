import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import { deleteUploadFiles } from '@/lib/storage';
import { getSetting } from '@/lib/settings';

export async function GET(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await props.params;
  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');

  const uploads = await prisma.upload.findMany({
    where: {
      eventId,
      ...(since ? { createdAt: { gt: new Date(since) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      deviceId: true,
    },
  });

  return NextResponse.json({ uploads });
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Require password re-confirmation for mass deletion
  const confirmPassword = request.headers.get('x-confirm-password');
  if (!confirmPassword || confirmPassword !== getSetting('ADMIN_PASSWORD')) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
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

    // Delete all physical files from Mac + SSD
    for (const upload of event.uploads) {
      deleteUploadFiles(upload.eventId, upload.id, upload.storedName);
    }

    await prisma.upload.deleteMany({
      where: { eventId: eventId }
    });

    return NextResponse.json({ success: true, count: event.uploads.length });
  } catch (error) {
    console.error('Error deleting all uploads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
