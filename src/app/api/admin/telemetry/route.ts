import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { telemetry } from '@/lib/telemetry';
import { getDiskStats, getPrimaryPath, getReplicaPath, isReplicaAvailable } from '@/lib/storage';

export const dynamic = 'force-dynamic';

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const snapshot = telemetry.getSnapshot();

    // Primary storage
    const primaryStats = getDiskStats(getPrimaryPath());
    const primaryStorage = primaryStats
      ? {
          totalGB: round1(primaryStats.totalGB),
          usedGB: round1(primaryStats.usedGB),
          freeGB: round1(primaryStats.freeGB),
          percentage: Math.round(primaryStats.percentage),
        }
      : null;

    // Replica storage
    const replicaPath = getReplicaPath();
    const replicaStats = replicaPath && isReplicaAvailable() ? getDiskStats(replicaPath) : null;
    const replicaStorage = replicaStats
      ? {
          totalGB: round1(replicaStats.totalGB),
          usedGB: round1(replicaStats.usedGB),
          freeGB: round1(replicaStats.freeGB),
          percentage: Math.round(replicaStats.percentage),
        }
      : null;

    return NextResponse.json({
      ...snapshot,
      storage: {
        primary: primaryStorage,
        replica: replicaStorage,
      },
    });
  } catch (err) {
    console.error('Error fetching telemetry:', err);
    return NextResponse.json({ error: 'Failed to fetch telemetry' }, { status: 500 });
  }
}
