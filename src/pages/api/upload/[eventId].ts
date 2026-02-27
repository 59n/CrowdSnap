import { NextApiRequest, NextApiResponse } from 'next';
import busboy from 'busboy';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import sharp from 'sharp';
import { getFilePath, initEventStorage } from '@/lib/storage';

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

  // Validate event
  const event = await prisma.event.findUnique({
    where: { id: eventId },
  });

  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (!event.isActive) {
    return res.status(403).json({ error: 'Event is not active' });
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
    const originalPath = getFilePath(eventId, 'originals', storedName);

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

        // Handle thumbnail generation
        if (mimeType.startsWith('image/')) {
          try {
            const thumbPath = getFilePath(eventId, 'thumbs', `${uuid}.jpg`);
            await sharp(originalPath)
              .resize({ width: 400, withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toFile(thumbPath);
          } catch (e) {
            console.warn(`[Warning] Thumbnail generation failed or format unsupported for ${filename}`);
            // Non-fatal error; image is saved but thumbnail won't be available
          }
        }

        // Write Metadata (simplified)
        const metaPath = getFilePath(eventId, 'metadata', `${uuid}.json`);
        fs.writeFileSync(metaPath, JSON.stringify({ originalName: filename, size: bytesReceived, mimeType }));

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
          res.status(200).json({ success: true, uploaded: successfulUploads.length });
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
