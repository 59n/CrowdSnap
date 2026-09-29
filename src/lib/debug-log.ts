import fs from 'fs';
import path from 'path';
import { getDiskStats, getPrimaryPath, getReplicaPath } from '@/lib/storage';

/**
 * Short diagnostic log for when nobody is at the machine.
 * Public read API: GET /api/logs
 * No passwords, tokens, or cookies are stored.
 */

export type DebugFields = Record<string, string | number | boolean | null>;

type DebugLine = DebugFields & {
  ts: string;
  level: 'info' | 'warn' | 'error';
  event: string;
};

const MAX_MEMORY = 2000;
const MAX_FILE_BYTES = 4_000_000;
const memory: DebugLine[] = [];
let filePath: string | null = null;
let hooksInstalled = false;

function logFile(): string {
  if (!filePath) {
    const dir = path.join(process.cwd(), 'data');
    fs.mkdirSync(dir, { recursive: true });
    filePath = path.join(dir, 'debug.log');
  }
  return filePath;
}

function trimFile() {
  const file = logFile();
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size < MAX_FILE_BYTES) return;
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-3000);
    fs.writeFileSync(file, lines.join('\n') + '\n');
  } catch {
    /* logging must not break uploads */
  }
}

export function debugLog(
  level: DebugLine['level'],
  event: string,
  fields: DebugFields = {}
) {
  installDebugHooks();
  const line: DebugLine = { ts: new Date().toISOString(), level, event, ...fields };
  memory.push(line);
  if (memory.length > MAX_MEMORY) memory.splice(0, memory.length - MAX_MEMORY);
  try {
    fs.appendFileSync(logFile(), JSON.stringify(line) + '\n');
    if (memory.length % 40 === 0) trimFile();
  } catch {
    /* ignore disk errors */
  }
}

export function readDebugLog(limit = 200): DebugLine[] {
  const n = Math.min(2000, Math.max(1, limit));
  const fromFile: DebugLine[] = [];
  try {
    const raw = fs.readFileSync(logFile(), 'utf8').trim();
    if (raw) {
      for (const row of raw.split('\n').slice(-n)) {
        try {
          fromFile.push(JSON.parse(row) as DebugLine);
        } catch {
          fromFile.push({ ts: '', level: 'error', event: 'log.parse', message: row.slice(0, 300) });
        }
      }
    }
  } catch {
    /* file may not exist yet */
  }
  const seen = new Set(fromFile.map((l) => JSON.stringify(l)));
  const extra = memory.filter((l) => !seen.has(JSON.stringify(l)));
  return [...fromFile, ...extra].slice(-n);
}

function diskFields(): DebugFields {
  try {
    const primary = getDiskStats(getPrimaryPath());
    const replicaRoot = getReplicaPath();
    const replica = replicaRoot ? getDiskStats(replicaRoot) : null;
    return {
      primaryFreeGB: primary ? Math.round(primary.freeGB) : -1,
      replicaFreeGB: replica ? Math.round(replica.freeGB) : -1,
    };
  } catch {
    return { primaryFreeGB: -1, replicaFreeGB: -1 };
  }
}

function lastEvent(): string {
  try {
    const raw = fs.readFileSync(logFile(), 'utf8').trim().split('\n').pop() || '';
    if (!raw) return '';
    const parsed = JSON.parse(raw) as DebugLine;
    return `${parsed.event}${parsed.message ? `: ${parsed.message}` : ''}`.slice(0, 240);
  } catch {
    return '';
  }
}

function installDebugHooks() {
  if (hooksInstalled || typeof process === 'undefined') return;
  hooksInstalled = true;
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      debugLog('warn', 'process.stopping', { signal, ...diskFields() });
      process.exit(0);
    });
  }
  process.on('uncaughtException', (err) => {
    debugLog('error', 'process.uncaught', {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack || '').slice(0, 800) : '',
    });
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    debugLog('error', 'process.rejection', {
      message: err.message,
      stack: (err.stack || '').slice(0, 800),
    });
  });
}

debugLog('info', 'process.ready', {
  pid: process.pid,
  previous: lastEvent(),
  ...diskFields(),
});
