import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBrrrWebhook,
  decideAlertAction,
  sendCriticalAlert,
  type AlertCooldownState,
} from '../src/lib/alert';

describe('parseBrrrWebhook', () => {
  it('accepts the official api.brrr.now webhook URL and extracts the secret', () => {
    const parsed = parseBrrrWebhook('https://api.brrr.now/v1/br_usr_a1b2c3d4e5f6g7h8i9j0');
    assert.deepEqual(parsed, { secret: 'br_usr_a1b2c3d4e5f6g7h8i9j0' });
  });

  it('accepts a pasted secret token', () => {
    const parsed = parseBrrrWebhook('br_dev_xyz987');
    assert.deepEqual(parsed, { secret: 'br_dev_xyz987' });
  });

  it('rejects non-brrr hosts to avoid SSRF from admin settings', () => {
    assert.equal(parseBrrrWebhook('https://evil.example/v1/br_usr_abc'), null);
    assert.equal(parseBrrrWebhook('https://api.brrr.now.evil.com/v1/br_usr_abc'), null);
    assert.equal(parseBrrrWebhook('http://api.brrr.now/v1/br_usr_abc'), null);
    assert.equal(parseBrrrWebhook('https://api.brrr.now/v1/../secret'), null);
    assert.equal(parseBrrrWebhook(''), null);
  });
});

describe('decideAlertAction', () => {
  const cooldownMs = 15 * 60 * 1000;

  it('sends the first firing of a key', () => {
    assert.equal(decideAlertAction({}, 'ssd.unplugged', 1_000, cooldownMs, false), 'send');
  });

  it('skips the same open alert inside the cooldown window', () => {
    const state: AlertCooldownState = {
      'ssd.unplugged': { lastSentAt: 1_000, open: true },
    };
    assert.equal(decideAlertAction(state, 'ssd.unplugged', 1_000 + 60_000, cooldownMs, false), 'skip');
  });

  it('resends after the cooldown while still open', () => {
    const state: AlertCooldownState = {
      'ssd.unplugged': { lastSentAt: 1_000, open: true },
    };
    assert.equal(
      decideAlertAction(state, 'ssd.unplugged', 1_000 + cooldownMs + 1, cooldownMs, false),
      'send'
    );
  });

  it('sends a recovered notification only if the alert was previously open', () => {
    const open: AlertCooldownState = {
      'ssd.unplugged': { lastSentAt: 1_000, open: true },
    };
    assert.equal(decideAlertAction(open, 'ssd.unplugged', 2_000, cooldownMs, true), 'recover');
    assert.equal(decideAlertAction({}, 'ssd.unplugged', 2_000, cooldownMs, true), 'skip');
  });
});

describe('sendCriticalAlert', () => {
  it('no-ops when no webhook is configured', async () => {
    const calls: unknown[] = [];
    const result = await sendCriticalAlert(
      { key: 'ssd.unplugged', title: 'SSD unplugged', message: 'Drive gone' },
      {
        webhookUrl: '',
        now: () => 1_000,
        fetch: async (...args) => {
          calls.push(args);
          return new Response('ok', { status: 200 });
        },
        store: memoryStore(),
      }
    );
    assert.equal(result, 'noop');
    assert.equal(calls.length, 0);
  });

  it('posts to /v1/send with the secret in Authorization, not the URL', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const result = await sendCriticalAlert(
      {
        key: 'storage.full',
        title: 'Storage full',
        message: 'All volumes are full',
        level: 'critical',
        threadId: 'crowdsnap-storage',
      },
      {
        webhookUrl: 'https://api.brrr.now/v1/br_usr_testsecret',
        now: () => 5_000,
        fetch: async (url, init) => {
          calls.push({ url: String(url), init: init || {} });
          return new Response('ok', { status: 200 });
        },
        store: memoryStore(),
      }
    );
    assert.equal(result, 'sent');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.brrr.now/v1/send');
    const headers = new Headers(calls[0].init.headers);
    assert.equal(headers.get('Authorization'), 'Bearer br_usr_testsecret');
    assert.equal(headers.get('Content-Type'), 'application/json');
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.title, 'Storage full');
    assert.equal(body.message, 'All volumes are full');
    assert.equal(body.thread_id, 'crowdsnap-storage');
    assert.equal(body.interruption_level, 'critical');
    assert.ok(!JSON.stringify(calls[0]).includes('br_usr_testsecret') || headers.get('Authorization'));
  });

  it('does not throw when brrr is unreachable', async () => {
    const result = await sendCriticalAlert(
      { key: 'web.down', title: 'Web down', message: 'container stopped' },
      {
        webhookUrl: 'https://api.brrr.now/v1/br_usr_x',
        now: () => 1_000,
        fetch: async () => {
          throw new Error('network');
        },
        store: memoryStore(),
      }
    );
    assert.equal(result, 'failed');
  });

  it('does not fetch an attacker-controlled webhook host', async () => {
    const calls: unknown[] = [];
    const result = await sendCriticalAlert(
      { key: 'ssd.unplugged', title: 'x', message: 'y' },
      {
        webhookUrl: 'https://evil.example/hook',
        now: () => 1_000,
        fetch: async (...args) => {
          calls.push(args);
          return new Response('ok', { status: 200 });
        },
        store: memoryStore(),
      }
    );
    assert.equal(result, 'noop');
    assert.equal(calls.length, 0);
  });
});

function memoryStore(initial: AlertCooldownState = {}) {
  let state = { ...initial };
  return {
    load() {
      return { ...state };
    },
    save(next: AlertCooldownState) {
      state = { ...next };
    },
  };
}
