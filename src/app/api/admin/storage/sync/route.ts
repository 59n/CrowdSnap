import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import path from 'path';
import { REPLICA_PATH } from '@/lib/storage';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

function syncDir(srcDir: string, destDir: string): { copied: number; skipped: number; failed: number } {
  let copied = 0, skipped = 0, failed = 0;
  if (!fs.existsSync(srcDir)) return { copied, skipped, failed };
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      const sub = syncDir(srcPath, destPath);
      copied += sub.copied; skipped += sub.skipped; failed += sub.failed;
    } else if (fs.existsSync(destPath)) {
      skipped++;
    } else {
      try { fs.copyFileSync(srcPath, destPath); copied++; }
      catch (e) { console.error(`[Sync] Failed: ${srcPath}`, e); failed++; }
    }
  }
  return { copied, skipped, failed };
}

/**
 * POST /api/admin/storage/sync
 * direction=to_replica (default): primary → replica
 * direction=to_primary:           replica → primary (sync back after overflow)
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!REPLICA_PATH) {
    return NextResponse.json({ error: 'STORAGE_REPLICA_PATH is not configured' }, { status: 400 });
  }

  try { fs.accessSync(REPLICA_PATH, fs.constants.W_OK); }
  catch { return NextResponse.json({ error: 'Replica not accessible (SSD not mounted?)' }, { status: 503 }); }

  let direction = 'to_replica';
  try { const body = await request.json(); direction = body.direction ?? 'to_replica'; } catch {}

  const primaryEventsDir = path.join(BASE_PATH, 'events');
  const replicaEventsDir = path.join(REPLICA_PATH, 'events');

  const { copied, skipped, failed } =
    direction === 'to_primary'
      ? syncDir(replicaEventsDir, primaryEventsDir)
      : syncDir(primaryEventsDir, replicaEventsDir);

  return NextResponse.json({ success: true, direction, copied, skipped, failed });
}

/**
 * GET /api/admin/storage/sync
 * Returns replica status: configured, mounted, file counts.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!REPLICA_PATH) {
    return NextResponse.json({ configured: false, mounted: false });
  }

  let mounted = false;
  let primaryCount = 0;
  let replicaCount = 0;

  try {
    fs.accessSync(REPLICA_PATH, fs.constants.W_OK);
    mounted = true;
  } catch {
    return NextResponse.json({ configured: true, mounted: false, path: REPLICA_PATH });
  }

  // Count only originals/ — one file per upload
  function countOriginals(eventsDir: string): number {
    if (!fs.existsSync(eventsDir)) return 0;
    let count = 0;
    for (const eventEntry of fs.readdirSync(eventsDir, { withFileTypes: true })) {
      if (!eventEntry.isDirectory()) continue;
      const originalsDir = path.join(eventsDir, eventEntry.name, 'originals');
      if (fs.existsSync(originalsDir)) {
        count += fs.readdirSync(originalsDir).length;
      }
    }
    return count;
  }

  primaryCount = countOriginals(path.join(BASE_PATH, 'events'));
  replicaCount = countOriginals(path.join(REPLICA_PATH, 'events'));

  return NextResponse.json({
    configured: true,
    mounted,
    path: REPLICA_PATH,
    primaryCount,
    replicaCount,
    inSync: primaryCount === replicaCount,
  });
}
