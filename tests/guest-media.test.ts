import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyGuestMediaFile } from '../src/lib/guest-media';

describe('isLikelyGuestMediaFile', () => {
  it('accepts known image and video MIME types', () => {
    assert.equal(isLikelyGuestMediaFile({ type: 'image/jpeg', name: 'a.jpg' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: 'image/heic', name: 'a.heic' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: 'image/avif', name: 'a.avif' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: 'video/mp4', name: 'a.mp4' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: 'video/quicktime', name: 'a.mov' }), true);
  });

  it('accepts iOS files with empty MIME when the extension is a photo or video', () => {
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'IMG_1234.HEIC' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'IMG_1234.heif' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'clip.MOV' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'clip.mp4' }), true);
  });

  it('accepts empty MIME with no extension so the server can sniff camera blobs', () => {
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'image' }), true);
  });

  it('accepts generic image/* and video/* family types', () => {
    assert.equal(isLikelyGuestMediaFile({ type: 'image/heic-sequence', name: 'a.heic' }), true);
    assert.equal(isLikelyGuestMediaFile({ type: 'video/3gpp', name: 'a.3gp' }), true);
  });

  it('rejects documents and executables', () => {
    assert.equal(isLikelyGuestMediaFile({ type: 'application/zip', name: 'photos.zip' }), false);
    assert.equal(isLikelyGuestMediaFile({ type: 'application/pdf', name: 'invite.pdf' }), false);
    assert.equal(isLikelyGuestMediaFile({ type: 'application/x-msdownload', name: 'virus.exe' }), false);
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'notes.txt' }), false);
    assert.equal(isLikelyGuestMediaFile({ type: '', name: 'setup.exe' }), false);
  });
});
