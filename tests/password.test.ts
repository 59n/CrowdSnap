import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  isPasswordHash,
  productionSecretsOk,
} from '../src/lib/password';

describe('password', () => {
  it('hashes and verifies', async () => {
    const hash = await hashPassword('correct-horse-battery');
    assert.equal(isPasswordHash(hash), true);
    const good = await verifyPassword('correct-horse-battery', hash);
    assert.equal(good.ok, true);
    assert.equal(good.needsRehash, false);
    const bad = await verifyPassword('wrong', hash);
    assert.equal(bad.ok, false);
  });

  it('migrates legacy plaintext with needsRehash', async () => {
    const r = await verifyPassword('legacy-pass', 'legacy-pass');
    assert.equal(r.ok, true);
    assert.equal(r.needsRehash, true);
    const no = await verifyPassword('nope', 'legacy-pass');
    assert.equal(no.ok, false);
  });

  it('rejects empty', async () => {
    const r = await verifyPassword('', 'x');
    assert.equal(r.ok, false);
  });

  it('productionSecretsOk fails without secret in production', () => {
    const a = productionSecretsOk({
      adminPassword: 'strongpassword1',
      nextAuthSecret: '',
      nodeEnv: 'production',
    });
    assert.equal(a.ok, false);

    const b = productionSecretsOk({
      adminPassword: 'admin123',
      nextAuthSecret: 'a'.repeat(32),
      nodeEnv: 'production',
    });
    assert.equal(b.ok, false);

    const c = productionSecretsOk({
      adminPassword: 'strongpassword1',
      nextAuthSecret: 'a'.repeat(32),
      nodeEnv: 'production',
    });
    assert.equal(c.ok, true);

    const d = productionSecretsOk({
      adminPassword: '',
      nextAuthSecret: '',
      nodeEnv: 'development',
    });
    assert.equal(d.ok, true);
  });
});
