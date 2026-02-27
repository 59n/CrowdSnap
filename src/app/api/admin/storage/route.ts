import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import fs from 'fs';
import os from 'os';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export async function GET() {
  const session = await getServerSession(authOptions);
  
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Check if the storage directory exists, create if not
    if (!fs.existsSync(BASE_PATH)) {
        fs.mkdirSync(BASE_PATH, { recursive: true });
    }

    // Get the exact filesystem stats for the local storage directory
    const statfs = fs.statfsSync(BASE_PATH);
    
    // Calculate sizes in GB
    const totalSpace = (statfs.blocks * statfs.bsize) / (1024 * 1024 * 1024);
    const freeSpace = (statfs.bavail * statfs.bsize) / (1024 * 1024 * 1024);
    const usedSpace = totalSpace - freeSpace;
    const usagePercentage = (usedSpace / totalSpace) * 100;

    return NextResponse.json({
        totalGB: totalSpace,
        usedGB: usedSpace,
        freeGB: freeSpace,
        percentage: usagePercentage,
        isWarning: usagePercentage > 85,
        isCritical: usagePercentage > 95
    });

  } catch (error) {
    console.error('Failed to get disk usage:', error);
    return NextResponse.json({ error: 'Failed to read disk statistics' }, { status: 500 });
  }
}
