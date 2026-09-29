import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDiskStats, getWriteRoot, isReplicaAvailable, getPrimaryPath, getReplicaPath } from '@/lib/storage';
import { notifyCritical } from '@/lib/alert';

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = getDiskStats(getPrimaryPath());
    if (!stats) {
      notifyCritical({
        key: 'disk.unreadable',
        title: 'Disk stats unreadable',
        message: 'CrowdSnap could not read primary disk free space.',
        level: 'time-sensitive',
        threadId: 'crowdsnap-storage',
      });
      return NextResponse.json({ error: 'Failed to read disk statistics' }, { status: 500 });
    }

    const { isOverflow } = getWriteRoot();
    const replicaReady = isReplicaAvailable();

    // Warn / critical based on free space (clearer than % on large volumes)
    const isWarning = stats.freeGB < 25 || stats.percentage > 90;
    const isCritical = stats.freeGB < 10 || stats.percentage > 95;

    notifyCritical({
      key: 'disk.mac_low',
      title: 'Primary disk critically low',
      message: `${stats.freeGB.toFixed(1)} GB free on primary storage.`,
      level: 'critical',
      threadId: 'crowdsnap-storage',
      recovered: !isCritical,
    });

    let replica: {
      totalGB: number;
      freeGB: number;
      usedGB: number;
      percentage: number;
      /** Docker Desktop often reports the Mac data volume for /Volumes/* bind mounts */
      capacityUnreliable?: boolean;
    } | null = null;

    const replicaPath = getReplicaPath();
    if (replicaPath && replicaReady) {
      const rStats = getDiskStats(replicaPath);
      if (rStats) {
        // virtiofs bug: external SSD stats often clone the primary Mac volume numbers
        const looksSameVolume =
          Math.abs(rStats.totalGB - stats.totalGB) < 1 &&
          Math.abs(rStats.freeGB - stats.freeGB) < 2;
        replica = {
          totalGB: round1(rStats.totalGB),
          freeGB: round1(rStats.freeGB),
          usedGB: round1(rStats.usedGB),
          percentage: Math.round(rStats.percentage),
          capacityUnreliable: looksSameVolume,
        };
      }
    }

    return NextResponse.json({
      totalGB: round1(stats.totalGB),
      usedGB: round1(stats.usedGB),
      freeGB: round1(stats.freeGB),
      percentage: Math.round(stats.percentage),
      freeImmediateGB: stats.freeImmediateGB ? round1(stats.freeImmediateGB) : undefined,
      matchesSystemSettings: stats.matchesSystemSettings ?? false,
      isWarning,
      isCritical,
      isOverflow,
      overflowReady: !!getReplicaPath() && replicaReady,
      // Clarify this is the Mac volume hosting STORAGE_PATH, not "app folder size"
      volumeLabel: 'Primary storage',
      path: getPrimaryPath(),
      replicaPath: getReplicaPath() || null,
      replica,
    });
  } catch (error) {
    console.error('Failed to get disk usage:', error);
    return NextResponse.json({ error: 'Failed to read disk statistics' }, { status: 500 });
  }
}
