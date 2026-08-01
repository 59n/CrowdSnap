import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { deleteUploadFiles } from '@/lib/storage';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; uploadId: string }> }
) {
  const { eventId, uploadId } = await params;
  const deviceId = request.headers.get('x-device-id');

  if (!deviceId) {
    return NextResponse.json({ error: 'Missing device identifier' }, { status: 400 });
  }

  const upload = await prisma.upload.findUnique({ where: { id: uploadId } });

  if (!upload || upload.eventId !== eventId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Only the original uploading device can delete
  if (upload.deviceId !== deviceId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Remove from Mac + SSD (same as admin) so orphans / re-sync don't bring them back
  deleteUploadFiles(upload.eventId, upload.id, upload.storedName);

  try {
    await prisma.upload.delete({ where: { id: uploadId } });
  } catch {
    // Already deleted (e.g. admin removed it first) — treat as success
  }

  return NextResponse.json({ success: true });
}
