import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { sendCriticalAlert } from '@/lib/alert';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await sendCriticalAlert(
    {
      key: 'test',
      title: 'CrowdSnap test',
      message: 'If you can read this, wedding-day alerts are working.',
      level: 'time-sensitive',
      threadId: 'crowdsnap-test',
    },
    { force: true }
  );

  if (result === 'noop') {
    return NextResponse.json(
      { error: 'No brrr webhook configured', result },
      { status: 400 }
    );
  }
  if (result === 'failed') {
    return NextResponse.json(
      { error: 'brrr did not accept the test alert', result },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, result });
}
