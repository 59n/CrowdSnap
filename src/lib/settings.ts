import fs from 'fs';
import path from 'path';
import { isAllowedStoragePath } from '@/lib/path-safe';
import { hashPassword, isPasswordHash } from '@/lib/password';
import { clampMaxFileSizeMB } from '@/lib/file-type';

/**
 * Runtime app settings — editable from the admin panel.
 * Values are stored in data/settings.json and mirrored into .env so
 * restarts / Docker still pick them up.
 */

export type SettingCategory = 'storage' | 'auth' | 'server' | 'tunnel';

export interface SettingFieldMeta {
  key: keyof AppSettings;
  label: string;
  description: string;
  category: SettingCategory;
  type: 'string' | 'number' | 'password' | 'path';
  /** Hide value in API responses */
  secret?: boolean;
  /** Changing this only fully applies after process restart */
  restartRequired?: boolean;
  placeholder?: string;
  /** Empty string means "not set" / optional */
  optional?: boolean;
}

/** All keys we manage (subset of env + overflow knobs). */
export interface AppSettings {
  STORAGE_PATH: string;
  STORAGE_REPLICA_PATH: string;
  STORAGE_OVERFLOW_FREE_GB: number;
  STORAGE_OVERFLOW_THRESHOLD: number;
  ADMIN_PASSWORD: string;
  NEXTAUTH_URL: string;
  NEXTAUTH_SECRET: string;
  MAX_UPLOAD_MB: number;
  DATABASE_URL: string;
  POSTGRES_USER: string;
  POSTGRES_PASSWORD: string;
  POSTGRES_DB: string;
  PANGOLIN_ENDPOINT: string;
  NEWT_ID: string;
  NEWT_SECRET: string;
}

export const SETTING_FIELDS: SettingFieldMeta[] = [
  {
    key: 'STORAGE_PATH',
    label: 'Primary storage path',
    description: 'Folder on this machine where uploads are stored (relative to project or absolute).',
    category: 'storage',
    type: 'path',
    placeholder: './storage',
  },
  {
    key: 'STORAGE_REPLICA_PATH',
    label: 'Backup SSD path',
    description: 'External drive / replica path for mirrored uploads. Leave empty to disable.',
    category: 'storage',
    type: 'path',
    optional: true,
    placeholder: '/Volumes/1TB/wedding',
  },
  {
    key: 'STORAGE_OVERFLOW_FREE_GB',
    label: 'Overflow free-space threshold (GB)',
    description: 'When Mac free space drops below this, new uploads go to the SSD first (auto mode).',
    category: 'storage',
    type: 'number',
  },
  {
    key: 'STORAGE_OVERFLOW_THRESHOLD',
    label: 'Overflow emergency % full',
    description: 'Secondary guard: force overflow when the volume is this full (0–100).',
    category: 'storage',
    type: 'number',
  },
  {
    key: 'MAX_UPLOAD_MB',
    label: 'Default max upload size (MB)',
    description: 'Fallback max file size. Individual events can override this in event settings.',
    category: 'storage',
    type: 'number',
  },
  {
    key: 'ADMIN_PASSWORD',
    label: 'Admin password',
    description: 'Password for the admin login and sensitive bulk actions.',
    category: 'auth',
    type: 'password',
    secret: true,
  },
  {
    key: 'NEXTAUTH_URL',
    label: 'Public site URL',
    description: 'Base URL used for QR codes and guest links (e.g. https://foto.example.com).',
    category: 'auth',
    type: 'string',
    placeholder: 'http://localhost:3000',
  },
  {
    key: 'NEXTAUTH_SECRET',
    label: 'Session secret',
    description: 'Random secret used to sign login sessions. Changing signs everyone out.',
    category: 'auth',
    type: 'password',
    secret: true,
    restartRequired: true,
  },
  {
    key: 'DATABASE_URL',
    label: 'Database URL',
    description: 'PostgreSQL connection string. Requires a server restart after change.',
    category: 'server',
    type: 'password',
    secret: true,
    restartRequired: true,
  },
  {
    key: 'POSTGRES_USER',
    label: 'Postgres user',
    description: 'Used by docker compose for the database container.',
    category: 'server',
    type: 'string',
    restartRequired: true,
  },
  {
    key: 'POSTGRES_PASSWORD',
    label: 'Postgres password',
    description: 'Used by docker compose for the database container.',
    category: 'server',
    type: 'password',
    secret: true,
    restartRequired: true,
  },
  {
    key: 'POSTGRES_DB',
    label: 'Postgres database name',
    description: 'Used by docker compose for the database container.',
    category: 'server',
    type: 'string',
    restartRequired: true,
  },
  {
    key: 'PANGOLIN_ENDPOINT',
    label: 'Pangolin endpoint',
    description: 'Optional tunnel endpoint (docker newt service).',
    category: 'tunnel',
    type: 'string',
    optional: true,
    restartRequired: true,
  },
  {
    key: 'NEWT_ID',
    label: 'Newt ID',
    description: 'Optional tunnel client id.',
    category: 'tunnel',
    type: 'string',
    optional: true,
    restartRequired: true,
  },
  {
    key: 'NEWT_SECRET',
    label: 'Newt secret',
    description: 'Optional tunnel client secret.',
    category: 'tunnel',
    type: 'password',
    secret: true,
    optional: true,
    restartRequired: true,
  },
];

// turbopackIgnore: do not NFT-trace entire project from process.cwd()
const PROJECT_ROOT = /* turbopackIgnore: true */ process.cwd();
const SETTINGS_DIR = path.join(PROJECT_ROOT, 'data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const ENV_FILE = path.join(PROJECT_ROOT, '.env');

const DEFAULTS: AppSettings = {
  STORAGE_PATH: './storage',
  STORAGE_REPLICA_PATH: '',
  STORAGE_OVERFLOW_FREE_GB: 10,
  STORAGE_OVERFLOW_THRESHOLD: 98,
  // No default password — must be set via env/settings
  ADMIN_PASSWORD: '',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: '',
  MAX_UPLOAD_MB: 100,
  DATABASE_URL: '',
  POSTGRES_USER: 'postgres',
  POSTGRES_PASSWORD: '',
  POSTGRES_DB: 'wedding',
  PANGOLIN_ENDPOINT: '',
  NEWT_ID: '',
  NEWT_SECRET: '',
};

let cache: AppSettings | null = null;
let cacheMtimeMs = 0;

function envString(key: string, fallback = ''): string {
  const v = process.env[key];
  return v !== undefined && v !== null ? String(v) : fallback;
}

function envNumber(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Build settings from process.env (used as seed / fallback). */
export function settingsFromEnv(): AppSettings {
  return {
    STORAGE_PATH: envString('STORAGE_PATH', DEFAULTS.STORAGE_PATH),
    STORAGE_REPLICA_PATH: envString('STORAGE_REPLICA_PATH', DEFAULTS.STORAGE_REPLICA_PATH),
    STORAGE_OVERFLOW_FREE_GB: envNumber('STORAGE_OVERFLOW_FREE_GB', DEFAULTS.STORAGE_OVERFLOW_FREE_GB),
    STORAGE_OVERFLOW_THRESHOLD: envNumber('STORAGE_OVERFLOW_THRESHOLD', DEFAULTS.STORAGE_OVERFLOW_THRESHOLD),
    ADMIN_PASSWORD: envString('ADMIN_PASSWORD', DEFAULTS.ADMIN_PASSWORD),
    NEXTAUTH_URL: envString('NEXTAUTH_URL', DEFAULTS.NEXTAUTH_URL),
    NEXTAUTH_SECRET: envString('NEXTAUTH_SECRET', DEFAULTS.NEXTAUTH_SECRET),
    MAX_UPLOAD_MB: envNumber('MAX_UPLOAD_MB', DEFAULTS.MAX_UPLOAD_MB),
    DATABASE_URL: envString('DATABASE_URL', DEFAULTS.DATABASE_URL),
    POSTGRES_USER: envString('POSTGRES_USER', DEFAULTS.POSTGRES_USER),
    POSTGRES_PASSWORD: envString('POSTGRES_PASSWORD', DEFAULTS.POSTGRES_PASSWORD),
    POSTGRES_DB: envString('POSTGRES_DB', DEFAULTS.POSTGRES_DB),
    PANGOLIN_ENDPOINT: envString('PANGOLIN_ENDPOINT', DEFAULTS.PANGOLIN_ENDPOINT),
    NEWT_ID: envString('NEWT_ID', DEFAULTS.NEWT_ID),
    NEWT_SECRET: envString('NEWT_SECRET', DEFAULTS.NEWT_SECRET),
  };
}

function readSettingsFile(): Partial<AppSettings> | null {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch (e) {
    console.warn('[settings] Failed to read settings.json:', (e as Error).message);
    return null;
  }
}

function fileMtime(p: string): number {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Full merged settings (file overrides env defaults). */
export function getAppSettings(): AppSettings {
  const mtime = fileMtime(SETTINGS_FILE);
  if (cache && cacheMtimeMs === mtime) return cache;

  const base = settingsFromEnv();
  const file = readSettingsFile();
  const merged: AppSettings = { ...base, ...(file || {}) };

  // Coerce numbers in case JSON had strings
  merged.STORAGE_OVERFLOW_FREE_GB = Number(merged.STORAGE_OVERFLOW_FREE_GB) || DEFAULTS.STORAGE_OVERFLOW_FREE_GB;
  merged.STORAGE_OVERFLOW_THRESHOLD = Number(merged.STORAGE_OVERFLOW_THRESHOLD) || DEFAULTS.STORAGE_OVERFLOW_THRESHOLD;
  merged.MAX_UPLOAD_MB = Number(merged.MAX_UPLOAD_MB) || DEFAULTS.MAX_UPLOAD_MB;

  cache = merged;
  cacheMtimeMs = mtime;
  return merged;
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  return getAppSettings()[key];
}

export function invalidateSettingsCache() {
  cache = null;
  cacheMtimeMs = 0;
}

function normalizeIncoming(partial: Partial<AppSettings>, current: AppSettings): AppSettings {
  const next: AppSettings = { ...current };

  for (const field of SETTING_FIELDS) {
    const key = field.key;
    if (!(key in partial) || partial[key] === undefined) continue;

    const raw = partial[key];

    // Secrets: empty string means "leave unchanged"
    if (field.secret && (raw === '' || raw === null)) continue;

    if (field.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      (next as any)[key] = n;
    } else {
      (next as any)[key] = String(raw ?? '').trim();
    }
  }

  // Clamp overflow knobs / max upload
  next.STORAGE_OVERFLOW_FREE_GB = Math.max(1, Math.min(500, next.STORAGE_OVERFLOW_FREE_GB));
  next.STORAGE_OVERFLOW_THRESHOLD = Math.max(50, Math.min(100, next.STORAGE_OVERFLOW_THRESHOLD));
  next.MAX_UPLOAD_MB = clampMaxFileSizeMB(next.MAX_UPLOAD_MB);

  // Storage path allowlist: reject traversal
  if (!isAllowedStoragePath(next.STORAGE_PATH)) {
    next.STORAGE_PATH = current.STORAGE_PATH || DEFAULTS.STORAGE_PATH;
  }
  if (next.STORAGE_REPLICA_PATH && !isAllowedStoragePath(next.STORAGE_REPLICA_PATH)) {
    next.STORAGE_REPLICA_PATH = current.STORAGE_REPLICA_PATH || '';
  }

  return next;
}

/** Write settings.json (source of truth for the running app). Mode 0600 when possible. */
function writeSettingsFile(settings: AppSettings) {
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  const tmp = SETTINGS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, SETTINGS_FILE);
  try {
    fs.chmodSync(SETTINGS_FILE, 0o600);
  } catch {
    /* windows etc */
  }
}

/**
 * Update or append keys in .env without wiping unrelated lines/comments.
 */
function writeEnvFile(settings: AppSettings) {
  let content = '';
  try {
    if (fs.existsSync(ENV_FILE)) content = fs.readFileSync(ENV_FILE, 'utf8');
  } catch {
    content = '';
  }

  const keys = SETTING_FIELDS.map((f) => f.key as string);
  const lines = content.length ? content.split(/\r?\n/) : [];
  const seen = new Set<string>();

  const valueFor = (key: string): string => {
    const v = (settings as any)[key];
    if (v === undefined || v === null) return '';
    return String(v);
  };

  const updated = lines.map((line) => {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) return line;
    const key = m[1];
    if (!keys.includes(key)) return line;
    seen.add(key);
    const val = valueFor(key);
    // Quote if contains spaces or special chars
    const needsQuote = /[\s#"']/.test(val);
    return `${key}=${needsQuote ? JSON.stringify(val) : val}`;
  });

  for (const key of keys) {
    if (seen.has(key)) continue;
    const val = valueFor(key);
    if (val === '' && SETTING_FIELDS.find((f) => f.key === key)?.optional) continue;
    const needsQuote = /[\s#"']/.test(val);
    updated.push(`${key}=${needsQuote ? JSON.stringify(val) : val}`);
  }

  // Ensure trailing newline
  let out = updated.join('\n');
  if (!out.endsWith('\n')) out += '\n';

  const tmp = ENV_FILE + '.tmp';
  fs.writeFileSync(tmp, out, 'utf8');
  fs.renameSync(tmp, ENV_FILE);

  // Keep process.env in sync for this process (best-effort)
  for (const field of SETTING_FIELDS) {
    const val = valueFor(field.key);
    if (val === '' && field.optional) {
      delete process.env[field.key];
    } else {
      process.env[field.key] = val;
    }
  }
}

export interface SaveSettingsResult {
  settings: AppSettings;
  restartRequired: string[];
}

/**
 * Persist settings to data/settings.json and .env.
 * Secret fields left as empty string are not changed.
 * ADMIN_PASSWORD plaintext is hashed before storage.
 */
export function saveAppSettings(partial: Partial<AppSettings>): SaveSettingsResult {
  const current = getAppSettings();
  const next = normalizeIncoming(partial, current);

  // Hash new admin password if provided as plaintext
  if (
    partial.ADMIN_PASSWORD &&
    String(partial.ADMIN_PASSWORD).trim() &&
    !isPasswordHash(String(next.ADMIN_PASSWORD))
  ) {
    // sync hash via deasync not available — use stored sync scrypt alternative
    // saveAppSettings is called from async routes; prefer asyncSaveAppSettings.
    // For sync path used by auth rehash, we use crypto scryptSync:
    const crypto = require('crypto') as typeof import('crypto');
    const salt = crypto.randomBytes(16);
    const derived = crypto.scryptSync(String(partial.ADMIN_PASSWORD), salt, 64);
    next.ADMIN_PASSWORD = `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  writeSettingsFile(next);
  writeEnvFile(next);
  invalidateSettingsCache();

  for (const field of SETTING_FIELDS) {
    const val = String(next[field.key] ?? '');
    if (val === '' && field.optional) delete process.env[field.key];
    else process.env[field.key] = val;
  }

  const restartRequired = SETTING_FIELDS
    .filter((f) => f.restartRequired && String(current[f.key]) !== String(next[f.key]))
    .map((f) => f.key);

  return { settings: getAppSettings(), restartRequired };
}

/** Async variant that uses async hashPassword. */
export async function saveAppSettingsAsync(
  partial: Partial<AppSettings>
): Promise<SaveSettingsResult> {
  const copy = { ...partial };
  if (copy.ADMIN_PASSWORD && String(copy.ADMIN_PASSWORD).trim() && !isPasswordHash(String(copy.ADMIN_PASSWORD))) {
    copy.ADMIN_PASSWORD = await hashPassword(String(copy.ADMIN_PASSWORD));
  }
  return saveAppSettings(copy);
}

/** Public-safe view: secrets masked (no filesystem paths). */
export function getPublicSettings(): {
  values: Record<string, string | number | boolean | null>;
  fields: SettingFieldMeta[];
} {
  const s = getAppSettings();
  const values: Record<string, string | number | boolean | null> = {};

  for (const field of SETTING_FIELDS) {
    const v = s[field.key];
    if (field.secret) {
      values[field.key] = v ? '••••••••' : '';
      values[`${field.key}__set`] = Boolean(v);
    } else {
      values[field.key] = v as string | number;
    }
  }

  return {
    values,
    fields: SETTING_FIELDS,
  };
}

/** Seed settings.json from current .env if missing (first boot). */
export function ensureSettingsFile() {
  if (fs.existsSync(SETTINGS_FILE)) return;
  try {
    writeSettingsFile(settingsFromEnv());
    invalidateSettingsCache();
  } catch (e) {
    console.warn('[settings] Could not seed settings.json:', (e as Error).message);
  }
}

// Seed on first import so admin always has a file to edit
try {
  ensureSettingsFile();
} catch {
  // ignore
}
