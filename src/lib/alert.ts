/**
 * Critical / time-sensitive push alerts via brrr (https://brrr.now/docs/).
 * Secret stays in Authorization, never in the request URL (URLs get logged).
 * No-ops until BRRR_WEBHOOK_URL is set in admin settings.
 */

import fs from 'fs';
import path from 'path';
import { getSetting } from '@/lib/settings';
import { parseBrrrWebhook } from '@/lib/brrr-url';

export { parseBrrrWebhook } from '@/lib/brrr-url';

export type AlertLevel = 'critical' | 'time-sensitive' | 'active';

export type AlertCooldownEntry = { lastSentAt: number; open: boolean };
export type AlertCooldownState = Record<string, AlertCooldownEntry>;

export interface AlertRequest {
  key: string;
  title: string;
  message: string;
  threadId?: string;
  level?: AlertLevel;
  recovered?: boolean;
}

export interface AlertStore {
  load(): AlertCooldownState;
  save(state: AlertCooldownState): void;
}

export interface AlertDeps {
  webhookUrl?: string;
  now?: () => number;
  fetch?: typeof fetch;
  store?: AlertStore;
  cooldownMs?: number;
  force?: boolean;
}

const BRRR_SEND_URL = 'https://api.brrr.now/v1/send';
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

const PROJECT_ROOT = /* turbopackIgnore: true */ process.cwd();
const COOLDOWN_FILE = path.join(PROJECT_ROOT, 'data', 'alert-cooldown.json');

export function decideAlertAction(
  state: AlertCooldownState,
  key: string,
  now: number,
  cooldownMs: number,
  recovered: boolean
): 'send' | 'skip' | 'recover' {
  const prev = state[key];
  if (recovered) return prev?.open ? 'recover' : 'skip';
  if (!prev || !prev.open) return 'send';
  if (now - prev.lastSentAt < cooldownMs) return 'skip';
  return 'send';
}

function fileStore(): AlertStore {
  return {
    load() {
      try {
        const raw = JSON.parse(fs.readFileSync(COOLDOWN_FILE, 'utf8')) as AlertCooldownState;
        return raw && typeof raw === 'object' ? raw : {};
      } catch {
        return {};
      }
    },
    save(state) {
      fs.mkdirSync(path.dirname(COOLDOWN_FILE), { recursive: true });
      const tmp = COOLDOWN_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(state) + '\n', { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, COOLDOWN_FILE);
      try {
        fs.chmodSync(COOLDOWN_FILE, 0o600);
      } catch {
        /* ignore */
      }
    },
  };
}

export async function sendCriticalAlert(
  req: AlertRequest,
  deps: AlertDeps = {}
): Promise<'sent' | 'skipped' | 'recovered' | 'noop' | 'failed'> {
  const webhookUrl = deps.webhookUrl !== undefined ? deps.webhookUrl : getSetting('BRRR_WEBHOOK_URL');
  const parsed = parseBrrrWebhook(webhookUrl);
  if (!parsed) return 'noop';

  const now = (deps.now ?? Date.now)();
  const cooldownMs = deps.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const store = deps.store ?? fileStore();
  const state = store.load();
  const action = deps.force
    ? req.recovered
      ? 'recover'
      : 'send'
    : decideAlertAction(state, req.key, now, cooldownMs, !!req.recovered);

  if (action === 'skip') return 'skipped';

  const level: AlertLevel = req.level ?? (req.recovered ? 'active' : 'critical');
  const title = action === 'recover' ? `Recovered: ${req.title}` : req.title;
  const message =
    action === 'recover' ? `${req.message} — this is now resolved.` : req.message;

  const body: Record<string, unknown> = {
    title,
    message,
    thread_id: req.threadId || `crowdsnap-${req.key.split('.')[0]}`,
    interruption_level: action === 'recover' ? 'active' : level,
    sound: action === 'recover' ? 'bubbly_success_ding' : level === 'critical' ? 'emergency' : 'upbeat_bells',
  };
  if (level === 'critical' && action !== 'recover') {
    body.volume = 1;
  }

  try {
    const fetchFn = deps.fetch ?? fetch;
    const res = await fetchFn(BRRR_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${parsed.secret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return 'failed';
  } catch {
    return 'failed';
  }

  state[req.key] = { lastSentAt: now, open: action !== 'recover' };
  try {
    store.save(state);
  } catch {
    /* still delivered */
  }
  return action === 'recover' ? 'recovered' : 'sent';
}

/** Fire-and-forget wrapper for request paths — never blocks the guest. */
export function notifyCritical(req: AlertRequest): void {
  void sendCriticalAlert(req).catch(() => {});
}
