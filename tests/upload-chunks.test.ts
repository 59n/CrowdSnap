import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkAction } from '../src/lib/upload-chunk-order';

describe('chunk upload order', () => {
  it('appends the next slice and ignores a lost-response retry', () => {
    assert.equal(chunkAction(0, 0), 'append');
    assert.equal(chunkAction(3, 3), 'append');
    assert.equal(chunkAction(3, 2), 'already');
  });

  it('rejects a skipped slice', () => {
    assert.equal(chunkAction(1, 3), 'gap');
  });
});