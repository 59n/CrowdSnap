import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { uploadLooksSlow } from '../src/lib/upload-pace';

describe('uploadLooksSlow', () => {
  it('waits a few seconds before calling a link slow', () => {
    assert.equal(uploadLooksSlow(10_000, 2_000, 4_000_000), false);
  });

  it('flags a large photo that is barely moving', () => {
    assert.equal(uploadLooksSlow(200_000, 5_000, 4_000_000), true);
  });

  it('does not flag a finished or brisk upload', () => {
    assert.equal(uploadLooksSlow(4_000_000, 8_000, 4_000_000), false);
    assert.equal(uploadLooksSlow(2_000_000, 5_000, 4_000_000), false);
  });
});