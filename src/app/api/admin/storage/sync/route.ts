import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import path from 'path';
import prisma from '@/lib/db';
import {
  getReplicaPath,
  getPrimaryPath,
  isReplicaAvailable,
  getCachedDiffStorageTrees,
  diffStorageTrees,
  syncMissingFiles,
  filterToAllowedEventRels,
  findOrphanRelativePaths,
  invalidateSyncDiffCache,
  type KnownUpload,
} from '@/lib/storage';

async function loadKnownUploads(): Promise<KnownUpload[]> {
  return prisma.upload.findMany({
    select: { id: true, eventId: true, storedName: true },
  });
}

/**
 * POST /api/admin/storage/sync
 * direction=to_replica (default): primary → replica (files only on Mac)
 * direction=to_primary:           replica → primary (files only on SSD)
 * direction=both:                 bidirectional merge
 *
 * Only files that belong to a DB upload (or event covers) are copied.
 * That prevents deleted photos from being resurrected off the SSD.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!getReplicaPath()) {
    return NextResponse.json({ error: 'STORAGE_REPLICA_PATH is not configured' }, { status: 400 });
  }

  if (!isReplicaAvailable()) {
    return NextResponse.json({ error: 'Replica not accessible (SSD not mounted?)' }, { status: 503 });
  }

  let direction = 'to_replica';
  try {
    const body = await request.json();
    direction = body.direction ?? 'to_replica';
  } catch {
    // empty body → default
  }

  if (direction !== 'to_primary' && direction !== 'to_replica' && direction !== 'both') {
    return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
  }

  const uploads = await loadKnownUploads();
  const primaryEventsDir = path.join(getPrimaryPath(), 'events');
  const replicaEventsDir = path.join(getReplicaPath()!, 'events');
  const diff = diffStorageTrees(); // force fresh walk on explicit sync

  let toReplica = { copied: 0, skipped: 0, failed: 0 };
  let toPrimary = { copied: 0, skipped: 0, failed: 0 };
  let skippedOrphans = 0;

  if (direction === 'to_primary' || direction === 'both') {
    const allowed = filterToAllowedEventRels(diff.replicaOnly, uploads);
    skippedOrphans += diff.replicaOnly.length - allowed.length;
    toPrimary = syncMissingFiles(replicaEventsDir, primaryEventsDir, allowed);
  }

  if (direction === 'to_replica' || direction === 'both') {
    const d = direction === 'both' ? diffStorageTrees() : diff;
    const allowed = filterToAllowedEventRels(d.primaryOnly, uploads);
    skippedOrphans += d.primaryOnly.length - allowed.length;
    toReplica = syncMissingFiles(primaryEventsDir, replicaEventsDir, allowed);
  }

  invalidateSyncDiffCache();
  const after = diffStorageTrees();
  // Re-diff only allowed files for "in sync" of real uploads
  const afterPrimaryOnlyAllowed = filterToAllowedEventRels(after.primaryOnly, uploads);
  const afterReplicaOnlyAllowed = filterToAllowedEventRels(after.replicaOnly, uploads);
  const orphans = findOrphanRelativePaths(uploads);

  return NextResponse.json({
    success: true,
    direction,
    copied: toReplica.copied + toPrimary.copied,
    skipped: toReplica.skipped + toPrimary.skipped,
    failed: toReplica.failed + toPrimary.failed,
    skippedOrphans,
    toReplica,
    toPrimary,
    remaining: {
      missingOnReplica: afterPrimaryOnlyAllowed.length,
      missingOnPrimary: afterReplicaOnlyAllowed.length,
      inSync: afterPrimaryOnlyAllowed.length === 0 && afterReplicaOnlyAllowed.length === 0,
    },
    orphans: {
      count: orphans.orphans.length,
      originals: orphans.orphans.filter((f) => f.includes('/originals/')).length,
    },
  });
}

/**
 * GET /api/admin/storage/sync
 * Returns replica status using real file-set comparison, plus orphan counts.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!getReplicaPath()) {
    return NextResponse.json({ configured: false, mounted: false });
  }

  if (!isReplicaAvailable()) {
    return NextResponse.json({
      configured: true,
      mounted: false,
      path: getReplicaPath(),
    });
  }

  const uploads = await loadKnownUploads();
  const diff = getCachedDiffStorageTrees();
  const missingOnReplica = filterToAllowedEventRels(diff.primaryOnly, uploads).length;
  const missingOnPrimary = filterToAllowedEventRels(diff.replicaOnly, uploads).length;
  const inSync = missingOnReplica === 0 && missingOnPrimary === 0;
  const orphans = findOrphanRelativePaths(uploads);
  const orphanOriginals = orphans.orphans.filter((f) => f.includes('/originals/')).length;

  return NextResponse.json({
    configured: true,
    mounted: true,
    path: getReplicaPath(),
    // Disk originals (includes orphans) — kept for transparency
    primaryCount: diff.primaryOriginals,
    replicaCount: diff.replicaOriginals,
    // DB is source of truth for the gallery
    dbCount: uploads.length,
    // Full tree file counts
    primaryFiles: diff.primaryCount,
    replicaFiles: diff.replicaCount,
    missingOnReplica,
    missingOnPrimary,
    missingOriginalsOnReplica: filterToAllowedEventRels(
      diff.primaryOnly.filter((f) => f.includes('/originals/')),
      uploads
    ).length,
    missingOriginalsOnPrimary: filterToAllowedEventRels(
      diff.replicaOnly.filter((f) => f.includes('/originals/')),
      uploads
    ).length,
    inSync,
    orphanFiles: orphans.orphans.length,
    orphanOriginals,
  });
}
