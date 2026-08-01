import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import prisma from '@/lib/db';
import { findOrphanRelativePaths, purgeOrphanFiles, type KnownUpload } from '@/lib/storage';

async function loadKnownUploads(): Promise<KnownUpload[]> {
  return prisma.upload.findMany({
    select: { id: true, eventId: true, storedName: true },
  });
}

/**
 * GET /api/admin/storage/orphans
 * Files on disk (Mac and/or SSD) that have no matching DB upload.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const uploads = await loadKnownUploads();
  const report = findOrphanRelativePaths(uploads);
  const orphanOriginals = report.orphans.filter((f) => f.includes('/originals/'));

  return NextResponse.json({
    ...report,
    orphanOriginals: orphanOriginals.length,
    orphanFiles: report.orphans.length,
  });
}

/**
 * DELETE /api/admin/storage/orphans
 * Remove orphan files from Mac and SSD. DB is the source of truth.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const uploads = await loadKnownUploads();
  const report = findOrphanRelativePaths(uploads);
  const result = purgeOrphanFiles(report.orphans);
  const after = findOrphanRelativePaths(uploads);

  return NextResponse.json({
    success: true,
    deleted: result.deleted,
    failed: result.failed,
    remainingOrphans: after.orphans.length,
    primaryOriginals: after.primaryOriginals,
    replicaOriginals: after.replicaOriginals,
    dbUploadCount: after.dbUploadCount,
  });
}
