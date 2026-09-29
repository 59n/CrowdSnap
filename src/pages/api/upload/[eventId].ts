import { telemetry } from '@/lib/telemetry';
import { NextApiRequest, NextApiResponse } from 'next';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import {
  initEventStorage,
  getWriteRoot,
  scheduleMirror,
  isSafeEventId,
  hasStorageRoom,
  getDiskStats,
  getPrimaryPath,
  getReplicaPath,
} from '@/lib/storage';
import { expirePastEvents, isEventOpenForGuests, findEventByIdOrSlug } from '@/lib/events';
import { enforceUploadRateLimits } from '@/lib/rate-limit';
import { resolveUploadType, clampMaxFileSizeMB } from '@/lib/file-type';
import { notifyCritical } from '@/lib/alert';
import { queueImageThumb } from '@/lib/thumb-queue';
import { handleChunkUpload } from '@/lib/upload-chunks';
import { debugLog } from '@/lib/debug-log';

export const config = {
  api: {
    bodyParser: false,
  },
};

function clientIp(req: NextApiRequest): string {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventId } = req.query;
  if (!eventId || typeof eventId !== 'string' || !isSafeEventId(eventId)) {
    return res.status(400).json({ error: 'Missing or invalid eventId' });
  }

  const ip = clientIp(req);
  const deviceId = (req.headers['x-device-id'] as string) || null;
  const chunkIndex = req.headers['x-chunk-index'];
  const isFollowUpChunk = chunkIndex !== undefined && String(chunkIndex) !== '0';

  await expirePastEvents();

  const event = await findEventByIdOrSlug(eventId);
  const canonicalEventId = event ? event.id : eventId;

  // Unknown events still count against the IP limit. Testing mode on a real
  // event skips per-IP and per-event upload limits without touching the buckets.
  // Later slices of one file are not new uploads.
  const blocked = isFollowUpChunk
    ? null
    : enforceUploadRateLimits({
        relaxSecurity: event ? (event.relaxSecurity ?? true) : true,
        ip,
        eventId: canonicalEventId,
      });
  if (blocked) {
    debugLog('warn', 'upload.rate_limited', {
      eventId: canonicalEventId,
      scope: blocked.scope,
      retryAfterMs: blocked.retryAfterMs,
    });
    res.setHeader('Retry-After', String(Math.ceil(blocked.retryAfterMs / 1000)));
    return res.status(429).json({ error: blocked.error });
  }
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (!isEventOpenForGuests(event)) {
    debugLog('warn', 'upload.closed', { eventId: canonicalEventId });
    return res.status(403).json({ error: 'Event is closed for uploads' });
  }

  if (!hasStorageRoom()) {
    const primary = getDiskStats(getPrimaryPath());
    const replicaRoot = getReplicaPath();
    const replica = replicaRoot ? getDiskStats(replicaRoot) : null;
    debugLog('error', 'upload.storage_full', {
      eventId: canonicalEventId,
      primaryFreeGB: primary ? Math.round(primary.freeGB) : -1,
      replicaFreeGB: replica ? Math.round(replica.freeGB) : -1,
    });
    notifyCritical({
      key: 'storage.full',
      title: 'Storage full',
      message: 'Guest uploads are blocked — Mac and SSD are both out of space.',
      level: 'critical',
      threadId: 'crowdsnap-storage',
    });
    return res.status(507).json({ error: 'Storage is full on all volumes' });
  }

  const maxFileSizeMB = clampMaxFileSizeMB(event.maxFileSizeMB);
  const maxFileSize = maxFileSizeMB * 1024 * 1024;

  initEventStorage(canonicalEventId);

  if (req.headers['x-chunk-index'] !== undefined) {
    await handleChunkUpload(req, res, canonicalEventId, deviceId, maxFileSize);
    return;
  }

  const bb = busboy({ headers: req.headers, limits: { fileSize: maxFileSize, files: 1 } });

  return new Promise<void>((resolve) => {
    const asyncTasks: Promise<unknown>[] = [];
    let hasError = false;

    bb.on('file', (_name, file, info) => {
      const { filename, mimeType: headerMime } = info;

      // Buffer first chunk for magic-byte sniff, then continue pipe
      let head: Buffer | null = null;
      let validated = false;
      let writeStream: fs.WriteStream | null = null;
      let originalPath = '';
      let storedName = '';
      let uuid = '';
      let finalMime = headerMime;
      let bytesReceived = 0;
      let isOverflow = false;

      const filePromise = new Promise((fileResolve) => {
        const fail = (status: number, error: string) => {
          hasError = true;
          file.resume();
          if (originalPath) fs.unlink(originalPath, () => {});
          if (!res.headersSent) res.status(status).json({ error });
          fileResolve(null);
        };

        file.on('data', (chunk: Buffer) => {
          if (hasError) return;
          bytesReceived += chunk.length;
          telemetry.recordInbound(chunk.length, ip);

          if (!validated) {
            head = head ? Buffer.concat([head, chunk]) : Buffer.from(chunk);
            if (head.length < 16 && bytesReceived < maxFileSize) {
              // wait for more bytes unless stream ends soon
              return;
            }
            const detected = resolveUploadType(headerMime, head);
            if ('error' in detected) {
              fail(400, detected.error);
              return;
            }
            validated = true;
            finalMime = detected.mime!;
            uuid = uuidv4();
            storedName = `${uuid}${detected.ext}`;

            const write = getWriteRoot();
            isOverflow = write.isOverflow;
            const originalsDir = path.join(write.root, 'events', canonicalEventId, 'originals');
            const thumbsDir = path.join(write.root, 'events', canonicalEventId, 'thumbs');
            const metaDir = path.join(write.root, 'events', canonicalEventId, 'metadata');
            [originalsDir, thumbsDir, metaDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));

            originalPath = path.join(originalsDir, storedName);
            writeStream = fs.createWriteStream(originalPath);
            writeStream.write(head);
            head = null;

            writeStream.on('error', () => {
              notifyCritical({
                key: 'upload.write_failed',
                title: 'Upload write failed',
                message: 'A guest photo could not be written to disk.',
                level: 'critical',
                threadId: 'crowdsnap-storage',
              });
              fail(500, 'Write failed');
            });
          } else if (writeStream) {
            writeStream.write(chunk);
          }
        });

        file.on('limit', () => {
          hasError = true;
          if (originalPath) fs.unlink(originalPath, () => {});
          if (!res.headersSent) res.status(413).json({ error: 'File size limit exceeded' });
          fileResolve(null);
        });

        file.on('end', async () => {
          if (hasError) return;

          if (!validated) {
            if (!head || head.length < 12) {
              fail(400, 'File too small to validate type');
              return;
            }
            const detected = resolveUploadType(headerMime, head);
            if ('error' in detected) {
              fail(400, detected.error);
              return;
            }
            validated = true;
            finalMime = detected.mime!;
            uuid = uuidv4();
            storedName = `${uuid}${detected.ext}`;
            const write = getWriteRoot();
            isOverflow = write.isOverflow;
            const originalsDir = path.join(write.root, 'events', canonicalEventId, 'originals');
            const thumbsDir = path.join(write.root, 'events', canonicalEventId, 'thumbs');
            const metaDir = path.join(write.root, 'events', canonicalEventId, 'metadata');
            [originalsDir, thumbsDir, metaDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));
            originalPath = path.join(originalsDir, storedName);
            writeStream = fs.createWriteStream(originalPath);
            writeStream.write(head);
          }

          if (!writeStream || !originalPath) {
            fail(500, 'Upload failed');
            return;
          }

          await new Promise<void>((r) => writeStream!.end(() => r()));

          const relativeOriginal = `events/${canonicalEventId}/originals/${storedName}`;
          const thumbsDir = path.join(path.dirname(path.dirname(originalPath)), 'thumbs');
          const metaDir = path.join(path.dirname(path.dirname(originalPath)), 'metadata');

          // Thumbnail runs after the response so a burst of large photos
          // does not block the guest page. At most two jobs at a time.
          if (finalMime.startsWith('image/')) {
            queueImageThumb({
              originalPath,
              thumbPath: path.join(thumbsDir, `${uuid}.jpg`),
              mirrorRelativePath: `events/${canonicalEventId}/thumbs/${uuid}.jpg`,
              isOverflow,
            });
          }

          const metaPath = path.join(metaDir, `${uuid}.json`);
          const metaContent = JSON.stringify({
            originalName: filename,
            size: bytesReceived,
            mimeType: finalMime,
          });
          fs.writeFileSync(metaPath, metaContent);

          try {
            const record = await prisma.upload.create({
              data: {
                id: uuid,
                eventId: canonicalEventId,
                originalName: filename,
                storedName,
                mimeType: finalMime,
                size: bytesReceived,
                relativePath: relativeOriginal,
                deviceId,
              },
            });

            // Primary+DB durable: mirror replica in background (never blocks guest success)
            scheduleMirror(originalPath, relativeOriginal, isOverflow);
            scheduleMirror(metaPath, `events/${canonicalEventId}/metadata/${uuid}.json`, isOverflow);

            fileResolve(record);
          } catch (e) {
            fs.unlink(originalPath, () => {});
            fs.unlink(metaPath, () => {});
            fail(500, 'Database error');
          }
        });
      });

      asyncTasks.push(filePromise);
    });

    bb.on('finish', async () => {
      await Promise.all(asyncTasks);
      if (!res.headersSent) {
        res.status(200).json({ success: true });
      }
      resolve();
    });

    bb.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error' });
      }
      resolve();
    });

    req.pipe(bb);
  });
}
