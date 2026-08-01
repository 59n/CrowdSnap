import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import { deleteUploadFiles } from '@/lib/storage';
import { getSetting } from '@/lib/settings';
import { verifyPassword } from '@/lib/password';
import { isSafeId } from '@/lib/path-safe';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: eventId } = await props.params;
  if (!isSafeId(eventId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  const cursor = searchParams.get('cursor');
  const limitRaw = Number(searchParams.get('limit') || DEFAULT_LIMIT);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));
  const countOnly = searchParams.get('countOnly') === '1';

  if (countOnly) {
    const [count, latest] = await Promise.all([
      prisma.upload.count({ where: { eventId } }),
      prisma.upload.findFirst({
        where: { eventId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return NextResponse.json({
      count,
      latestCreatedAt: latest?.createdAt?.toISOString() ?? null,
    });
  }

  // Incremental poll: only new rows since timestamp (no full list)
  if (since) {
    const uploads = await prisma.upload.findMany({
      where: {
        eventId,
        createdAt: { gt: new Date(since) },
      },
      orderBy: { createdAt: 'desc' },
      take: MAX_LIMIT,
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        deviceId: true,
      },
    });
    return NextResponse.json({ uploads, hasMore: false });
  }

  // Paginated list (cursor = upload id)
  const uploads = await prisma.upload.findMany({
    where: { eventId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      deviceId: true,
    },
  });

  const hasMore = uploads.length > limit;
  const page = hasMore ? uploads.slice(0, limit) : uploads;
  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  return NextResponse.json({
    uploads: page,
    nextCursor,
    hasMore,
  });
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const confirmPassword = request.headers.get('x-confirm-password');
  const pw = await verifyPassword(confirmPassword || '', getSetting('ADMIN_PASSWORD'));
  if (!confirmPassword || !pw.ok) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
  }

  const { id: eventId } = await props.params;
  if (!isSafeId(eventId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: { uploads: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    for (const upload of event.uploads) {
      deleteUploadFiles(upload.eventId, upload.id, upload.storedName);
    }

    await prisma.upload.deleteMany({ where: { eventId } });

    return NextResponse.json({ success: true, count: event.uploads.length });
  } catch (error) {
    console.error('Error deleting all uploads:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
