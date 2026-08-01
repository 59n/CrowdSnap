import { NextApiRequest, NextApiResponse } from 'next';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import sharp from 'sharp';
import {
  initEventStorage,
  getWriteRoot,
  scheduleMirror,
  isSafeEventId,
  hasStorageRoom,
} from '@/lib/storage';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';
import {
  checkRateLimit,
  rateLimitKey,
  UPLOAD_IP_LIMIT,
  UPLOAD_EVENT_LIMIT,
} from '@/lib/rate-limit';
import { resolveUploadType, clampMaxFileSizeMB } from '@/lib/file-type';

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
  const ipLimit = checkRateLimit(
    rateLimitKey('upload', 'ip', ip),
    UPLOAD_IP_LIMIT.max,
    UPLOAD_IP_LIMIT.windowMs
  );
  if (!ipLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(ipLimit.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Too many uploads from this network' });
  }
  const eventLimit = checkRateLimit(
    rateLimitKey('upload', 'event', eventId),
    UPLOAD_EVENT_LIMIT.max,
    UPLOAD_EVENT_LIMIT.windowMs
  );
  if (!eventLimit.allowed) {
    res.setHeader('Retry-After', String(Math.ceil(eventLimit.retryAfterMs / 1000)));
    return res.status(429).json({ error: 'Too many uploads for this event' });
  }

  const deviceId = (req.headers['x-device-id'] as string) || null;

  await expirePastEvents();

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  if (!isEventOpenForGuests(event)) {
    return res.status(403).json({ error: 'Event is closed for uploads' });
  }

  if (!hasStorageRoom()) {
    return res.status(507).json({ error: 'Storage is full on all volumes' });
  }

  const maxFileSizeMB = clampMaxFileSizeMB(event.maxFileSizeMB);
  const maxFileSize = maxFileSizeMB * 1024 * 1024;

  initEventStorage(eventId);

  const bb = busboy({ headers: req.headers, limits: { fileSize: maxFileSize, files: 1 } });

  return new Promise<void>((resolve) => {
    let asyncTasks: Promise<unknown>[] = [];
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
            const originalsDir = path.join(write.root, 'events', eventId, 'originals');
            const thumbsDir = path.join(write.root, 'events', eventId, 'thumbs');
            const metaDir = path.join(write.root, 'events', eventId, 'metadata');
            [originalsDir, thumbsDir, metaDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));

            originalPath = path.join(originalsDir, storedName);
            writeStream = fs.createWriteStream(originalPath);
            writeStream.write(head);
            head = null;

            writeStream.on('error', () => fail(500, 'Write failed'));
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
            const originalsDir = path.join(write.root, 'events', eventId, 'originals');
            const thumbsDir = path.join(write.root, 'events', eventId, 'thumbs');
            const metaDir = path.join(write.root, 'events', eventId, 'metadata');
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

          const relativeOriginal = `events/${eventId}/originals/${storedName}`;
          const thumbsDir = path.join(path.dirname(path.dirname(originalPath)), 'thumbs');
          const metaDir = path.join(path.dirname(path.dirname(originalPath)), 'metadata');

          // Thumbnail from file path — no full-buffer load of original
          if (finalMime.startsWith('image/')) {
            try {
              const thumbPath = path.join(thumbsDir, `${uuid}.jpg`);
              await sharp(originalPath)
                .rotate()
                .resize({ width: 400, withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toFile(thumbPath);
              // Async mirror thumb (best-effort; does not block response)
              scheduleMirror(thumbPath, `events/${eventId}/thumbs/${uuid}.jpg`, isOverflow);
            } catch (e) {
              console.warn(
                `[Warning] Thumbnail generation failed for ${filename}:`,
                (e as Error).message
              );
            }
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
                eventId,
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
            scheduleMirror(metaPath, `events/${eventId}/metadata/${uuid}.json`, isOverflow);

            fileResolve(record);
          } catch (dbError) {
            console.error('DB error:', dbError);
            // Cleanup orphan files on disk — client must not see success
            try {
              if (fs.existsSync(originalPath)) fs.unlinkSync(originalPath);
              const thumbPath = path.join(thumbsDir, `${uuid}.jpg`);
              if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
              if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
            } catch {
              /* ignore */
            }
            hasError = true;
            if (!res.headersSent) {
              res.status(500).json({ error: 'Failed to save upload' });
            }
            fileResolve(null);
          }
        });
      });

      asyncTasks.push(filePromise);
    });

    bb.on('error', (err) => {
      console.error('Busboy error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Upload streaming failed' });
      resolve();
    });

    bb.on('close', async () => {
      if (hasError) return resolve();

      try {
        const results = await Promise.all(asyncTasks);
        const successfulUploads = results.filter((r) => r !== null) as Array<{
          id: string;
          originalName: string;
          mimeType: string;
          size: number;
          createdAt: Date;
        }>;
        if (!res.headersSent) {
          if (successfulUploads.length === 0) {
            res.status(400).json({ error: 'No files uploaded', success: false, uploaded: 0 });
          } else {
            res.status(200).json({
              success: true,
              uploaded: successfulUploads.length,
              uploads: successfulUploads.map((u) => ({
                id: u.id,
                originalName: u.originalName,
                mimeType: u.mimeType,
                size: u.size,
                createdAt: u.createdAt,
              })),
            });
          }
        }
      } catch (e) {
        console.error('Finalization error:', e);
        if (!res.headersSent) res.status(500).json({ error: 'Failed to finalize upload' });
      }
      resolve();
    });

    req.pipe(bb);
  });
}
