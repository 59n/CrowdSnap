import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getDiskStats, getWriteRoot, isReplicaAvailable, getPrimaryPath, getReplicaPath } from '@/lib/storage';

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = getDiskStats(getPrimaryPath());
    if (!stats) {
      return NextResponse.json({ error: 'Failed to read disk statistics' }, { status: 500 });
    }

    const { isOverflow } = getWriteRoot();
    const replicaReady = isReplicaAvailable();

    // Warn / critical based on free space (clearer than % on large volumes)
    const isWarning = stats.freeGB < 25 || stats.percentage > 90;
    const isCritical = stats.freeGB < 10 || stats.percentage > 95;

    let replica: {
      totalGB: number;
      freeGB: number;
      usedGB: number;
      percentage: number;
    } | null = null;

    const replicaPath = getReplicaPath();
    if (replicaPath && replicaReady) {
      const rStats = getDiskStats(replicaPath);
      if (rStats) replica = rStats;
    }

    return NextResponse.json({
      totalGB: stats.totalGB,
      usedGB: stats.usedGB,
      freeGB: stats.freeGB,
      percentage: stats.percentage,
      freeImmediateGB: stats.freeImmediateGB,
      matchesSystemSettings: stats.matchesSystemSettings ?? false,
      isWarning,
      isCritical,
      isOverflow,
      overflowReady: !!getReplicaPath() && replicaReady,
      // Clarify this is the Mac volume hosting STORAGE_PATH, not "app folder size"
      volumeLabel: 'Mac disk',
      path: getPrimaryPath(),
      replica,
    });
  } catch (error) {
    console.error('Failed to get disk usage:', error);
    return NextResponse.json({ error: 'Failed to read disk statistics' }, { status: 500 });
  }
}
