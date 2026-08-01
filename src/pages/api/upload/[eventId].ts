import { NextApiRequest, NextApiResponse } from 'next';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import sharp from 'sharp';
import { initEventStorage, getWriteRoot, mirrorToOtherSide, mirrorBufferToOtherSide } from '@/lib/storage';
import { expirePastEvents, isEventOpenForGuests } from '@/lib/events';

// Disable Next.js default body parser to handle raw multipart stream
export const config = {
  api: {
    bodyParser: false,
  },
};

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { eventId } = req.query;
  if (!eventId || typeof eventId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid eventId' });
  }

  // Read device identifier (set by client, used to track ownership)
  const deviceId = (req.headers['x-device-id'] as string) || null;

  await expirePastEvents();

  // Validate event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (!isEventOpenForGuests(event)) {
    return res.status(403).json({ error: 'Event is closed for uploads' });
  }

  const maxFileSize = event.maxFileSizeMB * 1024 * 1024;

  // Ensure storage directories exist for this event
  initEventStorage(eventId);

  const bb = busboy({ headers: req.headers, limits: { fileSize: maxFileSize } });

  return new Promise<void>((resolve, reject) => {
    let asyncTasks: Promise<any>[] = [];
    let hasError = false;

    bb.on('file', (name, file, info) => {
    const { filename, encoding, mimeType } = info;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      hasError = true;
      if (!res.headersSent) res.status(400).json({ error: 'Invalid file type' });
      file.resume();
      return;
    }

    const fileExt = path.extname(filename).toLowerCase() || '.bin';
    const uuid = uuidv4();
    const storedName = `${uuid}${fileExt}`;

    // Determine write destination — overflow to replica when primary is near-full
    const { root: writeRoot, isOverflow } = getWriteRoot();
    const originalsDir = path.join(writeRoot, 'events', eventId, 'originals');
    const thumbsDir    = path.join(writeRoot, 'events', eventId, 'thumbs');
    const metaDir      = path.join(writeRoot, 'events', eventId, 'metadata');
    [originalsDir, thumbsDir, metaDir].forEach(d => fs.mkdirSync(d, { recursive: true }));

    const originalPath = path.join(originalsDir, storedName);

    const writeStream = fs.createWriteStream(originalPath);
    file.pipe(writeStream);

    let bytesReceived = 0;
    file.on('data', (data) => {
      bytesReceived += data.length;
    });

    file.on('limit', () => {
      hasError = true;
      fs.unlink(originalPath, () => {});
      if (!res.headersSent) res.status(413).json({ error: 'File size limit exceeded' });
    });

    const filePromise = new Promise((resolve) => {
      writeStream.on('close', async () => {
        if (hasError) {
          return resolve(null);
        }

        // Mirror to the other volume so Mac ↔ SSD stay in sync.
        // Normal: write primary, copy to SSD. Overflow: write SSD, try primary if space allows.
        const relativeOriginal = `events/${eventId}/originals/${storedName}`;
        if (isOverflow) {
          console.log(`[Overflow] Writing to replica for event ${eventId}: ${storedName}`);
        }
        mirrorToOtherSide(originalPath, relativeOriginal, isOverflow);

        // Handle thumbnail generation
        if (mimeType.startsWith('image/')) {
          try {
            const thumbPath = path.join(thumbsDir, `${uuid}.jpg`);
            // Read into buffer to ensure the OS has fully flushed the file
            // (required for HEIC and large files where write-close fires early).
            // .rotate() auto-corrects EXIF orientation for all phone photos.
            const imageBuffer = fs.readFileSync(originalPath);
            const thumbBuffer = await sharp(imageBuffer)
              .rotate()
              .resize({ width: 400, withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toBuffer();
            fs.writeFileSync(thumbPath, thumbBuffer);
            mirrorBufferToOtherSide(
              thumbBuffer,
              `events/${eventId}/thumbs/${uuid}.jpg`,
              isOverflow
            );
          } catch (e) {
            console.warn(`[Warning] Thumbnail generation failed for ${filename}:`, (e as Error).message);
            // Non-fatal error; image is saved but thumbnail won't be available
          }
        }

        // Write Metadata
        const metaPath = path.join(metaDir, `${uuid}.json`);
        const metaContent = JSON.stringify({ originalName: filename, size: bytesReceived, mimeType });
        fs.writeFileSync(metaPath, metaContent);
        mirrorBufferToOtherSide(
          Buffer.from(metaContent),
          `events/${eventId}/metadata/${uuid}.json`,
          isOverflow
        );

        try {
          // Save to database
          const record = await prisma.upload.create({
            data: {
              id: uuid,
              eventId: eventId,
              originalName: filename,
              storedName: storedName,
              mimeType: mimeType,
              size: bytesReceived,
              relativePath: `events/${eventId}/originals/${storedName}`,
              deviceId: deviceId,
            },
          });
          resolve(record);
        } catch (dbError) {
          console.error("DB error:", dbError);
          resolve(null);
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
      if (hasError) return resolve(); // Response sent in earlier handlers
      
      try {
        const results = await Promise.all(asyncTasks);
        const successfulUploads = results.filter(r => r !== null);
        if (!res.headersSent) {
          res.status(200).json({
            success: true,
            uploaded: successfulUploads.length,
            uploads: successfulUploads.map((u: any) => ({
              id: u.id,
              originalName: u.originalName,
              mimeType: u.mimeType,
              size: u.size,
              createdAt: u.createdAt,
            })),
          });
        }
      } catch (e) {
         console.error("Finalization error:", e);
         if (!res.headersSent) res.status(500).json({ error: "Failed to finalize upload" });
      }
      resolve();
    });

    req.pipe(bb);
  });
}
