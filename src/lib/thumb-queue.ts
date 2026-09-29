import fs from 'fs';
import sharp from 'sharp';
import { scheduleMirror } from '@/lib/storage';
import { debugLog } from '@/lib/debug-log';

/** Keep libvips from using every core while guests are also loading pages. */
sharp.concurrency(2);

const MAX_IN_FLIGHT = 2;

type Job = () => Promise<void>;

let inFlight = 0;
const pending = new Set<string>();
const queue: Job[] = [];

function pump() {
  while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
    const job = queue.shift()!;
    inFlight += 1;
    job().finally(() => {
      inFlight -= 1;
      pump();
    });
  }
}

/** Run at most two thumbnail jobs at a time. Same path is not queued twice. */
export function queueImageThumb(opts: {
  originalPath: string;
  thumbPath: string;
  mirrorRelativePath: string;
  isOverflow: boolean;
}) {
  if (pending.has(opts.thumbPath)) return;
  pending.add(opts.thumbPath);
  queue.push(async () => {
    try {
      if (!fs.existsSync(opts.originalPath) || fs.existsSync(opts.thumbPath)) return;
      await sharp(opts.originalPath)
        .rotate()
        .resize({ width: 400, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(opts.thumbPath);
      scheduleMirror(opts.thumbPath, opts.mirrorRelativePath, opts.isOverflow);
    } catch (e) {
      const message = (e as Error).message;
      debugLog('error', 'thumb.failed', { message, path: opts.thumbPath });
    } finally {
      pending.delete(opts.thumbPath);
    }
  });
  pump();
}

/** Test hook: how many thumb jobs are waiting or running. */
export function thumbQueueDepth(): number {
  return pending.size;
}

/** Live status of thumbnail generation */
export function getThumbQueueStats(): { inFlight: number; pending: number; maxInFlight: number } {
  return {
    inFlight,
    pending: pending.size,
    maxInFlight: MAX_IN_FLIGHT,
  };
}
