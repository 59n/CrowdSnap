import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { deleteUploadFiles, isSafeEventId } from '@/lib/storage';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';
import { isSafeId } from '@/lib/path-safe';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;
  const deviceId = request.headers.get('x-device-id');

  if (!isSafeEventId(eventId) || !isSafeId(uploadId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!deviceId) {
    return NextResponse.json({ error: 'Missing device identifier' }, { status: 400 });
  }

  await expirePastEvents();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event || !isEventOpenForGuests(event)) {
    return NextResponse.json({ error: 'Event is closed' }, { status: 403 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

  if (!upload || upload.eventId !== eventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (upload.deviceId !== deviceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  deleteUploadFiles(upload.eventId, upload.id, upload.storedName);

  try {
    await prisma.upload.delete({ where: { id: uploadId } });
  } catch {
    // Already deleted
  }

  return NextResponse.json({ success: true });
}
