import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import {
  getPublicSettings,
  saveAppSettingsAsync,
  getSetting,
  type AppSettings,
} from '@/lib/settings';
import { verifyPassword } from '@/lib/password';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(getPublicSettings());
}

/**
 * PUT /api/admin/settings
 * Body: { values: Partial<AppSettings>, currentPassword: string }
 * currentPassword must match the current admin password.
 * Leave secret fields empty to keep existing values.
 */
export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { values?: Partial<AppSettings>; currentPassword?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const currentPassword = body.currentPassword ?? '';
  const pwCheck = await verifyPassword(currentPassword, getSetting('ADMIN_PASSWORD'));
  if (!currentPassword || !pwCheck.ok) {
    return NextResponse.json(
      { error: 'Current admin password is required (and must be correct)' },
      { status: 403 }
    );
  }

  if (!body.values || typeof body.values !== 'object') {
    return NextResponse.json({ error: 'Missing values' }, { status: 400 });
  }

  try {
    const { restartRequired } = await saveAppSettingsAsync(body.values);
    return NextResponse.json({
      success: true,
      restartRequired,
      ...getPublicSettings(),
    });
  } catch (e) {
    console.error('[settings] save failed:', e);
    return NextResponse.json(
      { error: (e as Error).message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
