import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit, resetRateLimits, rateLimitKey, ipFromHeaders } from '../src/lib/rate-limit';

describe('rate-limit', () => {
  it('allows then blocks after max', () => {
    resetRateLimits();
    const key = rateLimitKey('test', 'ip1');
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      const r = checkRateLimit(key, 3, 60_000, now + i);
      assert.equal(r.allowed, true);
    }
    const blocked = checkRateLimit(key, 3, 60_000, now + 10);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it('resets after window', () => {
    resetRateLimits();
    const key = rateLimitKey('test', 'ip2');
    const now = 2_000_000;
    assert.equal(checkRateLimit(key, 1, 1000, now).allowed, true);
    assert.equal(checkRateLimit(key, 1, 1000, now + 10).allowed, false);
    assert.equal(checkRateLimit(key, 1, 1000, now + 1001).allowed, true);
  });

  it('login keys are per-IP not global', () => {
    resetRateLimits();
    const a = rateLimitKey('login', '1.2.3.4');
    const b = rateLimitKey('login', '5.6.7.8');
    assert.notEqual(a, b);
    assert.equal(a.includes('1.2.3.4'), true);
    assert.equal(checkRateLimit(a, 1, 60_000, 100).allowed, true);
    assert.equal(checkRateLimit(a, 1, 60_000, 101).allowed, false);
    // other IP still allowed
    assert.equal(checkRateLimit(b, 1, 60_000, 102).allowed, true);
  });

  it('ipFromHeaders uses x-forwarded-for first hop', () => {
    const h = new Headers({ 'x-forwarded-for': '10.0.0.9, 1.1.1.1' });
    assert.equal(ipFromHeaders(h), '10.0.0.9');
  });
});
