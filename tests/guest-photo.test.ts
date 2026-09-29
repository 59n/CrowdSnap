import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isRasterPhoto, scaledPhotoSize } from '../src/lib/guest-photo';

describe('guest photo shrink', () => {
  it('scales a phone photo down to the long edge', () => {
    assert.deepEqual(scaledPhotoSize(4032, 3024), { width: 2560, height: 1920 });
    assert.deepEqual(scaledPhotoSize(1200, 800), { width: 1200, height: 800 });
  });

  it('treats photos as shrinkable and leaves video and gif alone', () => {
    assert.equal(isRasterPhoto({ type: 'image/jpeg', name: 'a.jpg' }), true);
    assert.equal(isRasterPhoto({ type: '', name: 'IMG_1.HEIC' }), true);
    assert.equal(isRasterPhoto({ type: 'image/gif', name: 'a.gif' }), true);
    assert.equal(isRasterPhoto({ type: 'video/mp4', name: 'a.mp4' }), false);
  });
});