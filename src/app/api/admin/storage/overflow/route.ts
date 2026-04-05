import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { getOverrideMode, setOverrideMode, getWriteRoot } from '@/lib/storage';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { isOverflow, overrideMode } = getWriteRoot();
  return NextResponse.json({ overrideMode, isOverflow });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { mode } = await request.json() as { mode: 'on' | 'off' | 'auto' };
  if (!['on', 'off', 'auto'].includes(mode)) {
    return NextResponse.json({ error: 'Invalid mode' }, { status: 400 });
  }

  setOverrideMode(mode);
  const { isOverflow, overrideMode } = getWriteRoot();
  return NextResponse.json({ overrideMode, isOverflow });
}
