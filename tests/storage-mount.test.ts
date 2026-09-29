import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDistinctWritableReplica } from '../src/lib/storage';

describe('replica mount safety', () => {
  it('rejects a missing drive without creating a replica directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crowdsnap-storage-'));
    try {
      const primary = path.join(root, 'primary');
      const replica = path.join(root, 'missing-ssd', 'wedding');
      fs.mkdirSync(primary);
      assert.equal(isDistinctWritableReplica(replica, primary), false);
      assert.equal(fs.existsSync(replica), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a writable fallback directory on the primary filesystem', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crowdsnap-storage-'));
    try {
      const primary = path.join(root, 'primary');
      const replica = path.join(root, 'fake-ssd');
      fs.mkdirSync(primary);
      fs.mkdirSync(replica);
      assert.equal(isDistinctWritableReplica(replica, primary), false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
