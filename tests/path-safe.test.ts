import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { isSafeId, safeJoin, safeResolveUnder, isAllowedStoragePath } from '../src/lib/path-safe';

describe('path-safe', () => {
  it('accepts safe ids', () => {
    assert.equal(isSafeId('cmm2o3i1m0000dp7s13fwyewh'), true);
    assert.equal(isSafeId('uuid-123_abc'), true);
  });

  it('rejects path-like ids', () => {
    assert.equal(isSafeId('../etc'), false);
    assert.equal(isSafeId('a/b'), false);
    assert.equal(isSafeId(''), false);
    assert.equal(isSafeId('..'), false);
  });

  it('safeJoin stays under root', () => {
    const root = path.resolve('/tmp/crowdsnap-root');
    const ok = safeJoin(root, 'events', 'abc', 'originals', 'f.jpg');
    assert.ok(ok);
    assert.ok(ok!.startsWith(root));
  });

  it('safeJoin blocks traversal segments', () => {
    const root = path.resolve('/tmp/crowdsnap-root');
    assert.equal(safeJoin(root, 'events', '..', 'etc'), null);
    assert.equal(safeJoin(root, '..'), null);
    assert.equal(safeJoin(root, 'a/b'), null);
  });

  it('safeResolveUnder blocks .. in relative path', () => {
    const root = path.resolve('/var/storage');
    assert.equal(safeResolveUnder(root, 'events/../secret'), null);
    assert.equal(safeResolveUnder(root, '../../../etc/passwd'), null);
    const ok = safeResolveUnder(root, 'events/e1/originals/x.jpg');
    assert.ok(ok);
    assert.ok(ok!.includes('events'));
  });

  it('isAllowedStoragePath allowlists project + volumes only', () => {
    assert.equal(isAllowedStoragePath('../outside'), false);
    assert.equal(isAllowedStoragePath('./storage'), true);
    assert.equal(isAllowedStoragePath('storage'), true);
    assert.equal(isAllowedStoragePath('/Volumes/1TB/wedding'), true);
    assert.equal(isAllowedStoragePath('/etc/passwd'), false);
    assert.equal(isAllowedStoragePath('/tmp/evil'), false);
    assert.equal(isAllowedStoragePath('/Users/someone/.ssh'), false);
    assert.equal(isAllowedStoragePath(''), false);
  });

  it('isAllowedStoragePath honors STORAGE_ALLOWED_ROOTS', () => {
    const prev = process.env.STORAGE_ALLOWED_ROOTS;
    process.env.STORAGE_ALLOWED_ROOTS = '/opt/wedding-data';
    try {
      assert.equal(isAllowedStoragePath('/opt/wedding-data/events'), true);
      assert.equal(isAllowedStoragePath('/opt/other'), false);
    } finally {
      if (prev === undefined) delete process.env.STORAGE_ALLOWED_ROOTS;
      else process.env.STORAGE_ALLOWED_ROOTS = prev;
    }
  });
});
