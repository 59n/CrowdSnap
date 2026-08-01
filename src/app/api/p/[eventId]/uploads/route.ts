import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;
  const deviceId = request.headers.get('x-device-id');

  if (!deviceId) {
    return NextResponse.json({ uploads: [] });
  }

  await expirePastEvents();

  // Validate event is open for guests
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !isEventOpenForGuests(event)) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const uploads = await prisma.upload.findMany({
    where: { eventId, deviceId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ uploads });
}
