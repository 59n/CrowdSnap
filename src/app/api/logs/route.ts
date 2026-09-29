import { NextResponse } from 'next/server';
import { debugLog, readDebugLog } from '@/lib/debug-log';

export const dynamic = 'force-dynamic';

const recentByIp = new Map<string, number[]>();

function allowClientPost(ip: string): boolean {
  const now = Date.now();
  const hits = (recentByIp.get(ip) || []).filter((t) => now - t < 60_000);
  if (hits.length >= 40) {
    recentByIp.set(ip, hits);
    return false;
  }
  hits.push(now);
  recentByIp.set(ip, hits);
  return true;
}

/** Public diagnostic feed. No secrets. */
export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get('limit') || '500');
  const lines = readDebugLog(Number.isFinite(limit) ? limit : 200);
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    count: lines.length,
    lines,
  });
}

/** Browser-side events (upload stuck, chunk failed). */
export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!allowClientPost(ip)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = String(body.event || 'client').slice(0, 80);
  const fields: Record<string, string | number | boolean | null> = { source: 'browser' };
  for (const [key, value] of Object.entries(body)) {
    if (key === 'event') continue;
    if (typeof value === 'string') fields[key] = value.slice(0, 300);
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      fields[key] = value;
    }
  }
  debugLog('info', `client.${event}`, fields);
  return NextResponse.json({ ok: true });
}
