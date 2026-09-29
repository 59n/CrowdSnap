import { telemetry } from '@/lib/telemetry';
import fs from 'fs';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';
import { getWriteRoot, scheduleMirror } from '@/lib/storage';
import { resolveUploadType } from '@/lib/file-type';
import { queueImageThumb } from '@/lib/thumb-queue';
import { isSafeId } from '@/lib/path-safe';
import { chunkAction, UPLOAD_CHUNK_BYTES } from '@/lib/upload-chunk-order';
import { debugLog } from '@/lib/debug-log';

export { UPLOAD_CHUNK_BYTES };

type ChunkMeta = {
  next: number;
  name: string;
  mime: string;
  total: number;
  count: number;
};

function headerString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}

function readBody(req: NextApiRequest, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('chunk too big'));
        req.destroy();
        return;
      }
      parts.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(parts)));
    req.on('error', reject);
  });
}

/**
 * Accept one slice of a large upload. Returns true when the request was a chunk
 * (the response is already sent).
 */
export async function handleChunkUpload(
  req: NextApiRequest,
  res: NextApiResponse,
  eventId: string,
  deviceId: string | null,
  maxFileSize: number
): Promise<boolean> {
  if (headerString(req.headers['x-chunk-index']) === '') return false;

  const uploadId = headerString(req.headers['x-upload-id']);
  const index = Number(headerString(req.headers['x-chunk-index']));
  const count = Number(headerString(req.headers['x-chunk-count']));
  const total = Number(headerString(req.headers['x-file-size']));
  const name = path.basename(headerString(req.headers['x-file-name']) || 'upload');
  const mime = headerString(req.headers['x-file-type']) || 'application/octet-stream';

  if (!isSafeId(uploadId) || !Number.isInteger(index) || !Number.isInteger(count)) {
    res.status(400).json({ error: 'Invalid upload chunk' });
    return true;
  }
  if (index < 0 || count < 1 || index >= count || !Number.isFinite(total) || total < 1) {
    res.status(400).json({ error: 'Invalid upload chunk' });
    return true;
  }
  if (total > maxFileSize) {
    debugLog('warn', 'upload.too_large', { eventId, name, total, maxFileSize });
    res.status(400).json({ error: `File too large (max ${Math.round(maxFileSize / (1024 * 1024))}MB)` });
    return true;
  }

  const ip = headerString(req.headers['x-forwarded-for']).split(',')[0].trim() || req.socket.remoteAddress || '';
  const write = getWriteRoot();
  const dir = path.join(write.root, 'events', eventId, 'partials');
  fs.mkdirSync(dir, { recursive: true });
  const binPath = path.join(dir, `${uploadId}.bin`);
  const metaPath = path.join(dir, `${uploadId}.json`);

  let meta: ChunkMeta = { next: 0, name, mime, total, count };
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as ChunkMeta;
    } catch {
      meta = { next: 0, name, mime, total, count };
    }
  }

  const action = chunkAction(meta.next, index);
  if (action === 'gap') {
    debugLog('warn', 'upload.chunk_gap', { eventId, uploadId, index, expected: meta.next, name });
    res.status(409).json({ error: 'Upload chunk out of order', next: meta.next });
    return true;
  }

  if (action === 'append') {
    debugLog('info', 'upload.chunk_begin', {
      eventId,
      uploadId,
      index,
      count,
      total,
      name,
    });
    const started = Date.now();
    let body: Buffer;
    try {
      body = await readBody(req, UPLOAD_CHUNK_BYTES + 64 * 1024);
    } catch {
      debugLog('error', 'upload.chunk_read_failed', { eventId, uploadId, index, name });
      res.status(400).json({ error: 'Upload chunk too big' });
      return true;
    }
    const start = index * UPLOAD_CHUNK_BYTES;
    const expected = index === count - 1 ? total - start : UPLOAD_CHUNK_BYTES;
    if (body.length !== expected) {
      debugLog('warn', 'upload.chunk_size', {
        eventId,
        uploadId,
        index,
        got: body.length,
        expected,
        name,
      });
      res.status(400).json({ error: 'Upload chunk size does not match the file' });
      return true;
    }
    fs.appendFileSync(binPath, body);
    telemetry.recordInbound(body.length, ip);
    meta = { next: index + 1, name, mime, total, count };
    fs.writeFileSync(metaPath, JSON.stringify(meta));
    const bytesDone = start + body.length;
    const ms = Date.now() - started;
    debugLog(ms > 8_000 ? 'warn' : 'info', 'upload.chunk', {
      eventId,
      uploadId,
      index,
      count,
      name,
      bytes: body.length,
      bytesDone,
      total,
      pct: Math.round((bytesDone / total) * 1000) / 10,
      ms,
    });
  }

  if (meta.next < count) {
    res.status(200).json({ received: index, done: false });
    return true;
  }

  try {
    const record = await commitAssembledUpload({
      eventId,
      binPath,
      filename: name,
      headerMime: mime,
      deviceId,
      isOverflow: write.isOverflow,
    });
    fs.rmSync(metaPath, { force: true });
    telemetry.recordUpload({
      id: record.id,
      eventId,
      fileName: name,
      sizeBytes: total,
      mimeType: record.mimeType,
      ip,
      userAgent: headerString(req.headers['user-agent']),
    });
    res.status(200).json({
      success: true,
      uploaded: 1,
      uploads: [record],
    });
  } catch (error) {
    fs.rmSync(binPath, { force: true });
    fs.rmSync(metaPath, { force: true });
    const message = error instanceof Error ? error.message : 'Failed to save upload';
    debugLog('error', 'upload.assemble_failed', { eventId, uploadId, name, message });
    res.status(400).json({ error: message });
  }
  return true;
}

async function commitAssembledUpload(opts: {
  eventId: string;
  binPath: string;
  filename: string;
  headerMime: string;
  deviceId: string | null;
  isOverflow: boolean;
}) {
  const head = Buffer.alloc(16);
  const fd = fs.openSync(opts.binPath, 'r');
  try {
    fs.readSync(fd, head, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }
  const detected = resolveUploadType(opts.headerMime, head);
  if ('error' in detected) throw new Error(detected.error);

  const uuid = uuidv4();
  const storedName = `${uuid}${detected.ext}`;
  const write = getWriteRoot();
  const originalsDir = path.join(write.root, 'events', opts.eventId, 'originals');
  const thumbsDir = path.join(write.root, 'events', opts.eventId, 'thumbs');
  const metaDir = path.join(write.root, 'events', opts.eventId, 'metadata');
  for (const dir of [originalsDir, thumbsDir, metaDir]) fs.mkdirSync(dir, { recursive: true });

  const originalPath = path.join(originalsDir, storedName);
  fs.renameSync(opts.binPath, originalPath);
  const relativeOriginal = `events/${opts.eventId}/originals/${storedName}`;
  const size = fs.statSync(originalPath).size;

  if (detected.mime!.startsWith('image/')) {
    queueImageThumb({
      originalPath,
      thumbPath: path.join(thumbsDir, `${uuid}.jpg`),
      mirrorRelativePath: `events/${opts.eventId}/thumbs/${uuid}.jpg`,
      isOverflow: opts.isOverflow,
    });
  }

  const metaFile = path.join(metaDir, `${uuid}.json`);
  fs.writeFileSync(
    metaFile,
    JSON.stringify({ originalName: opts.filename, size, mimeType: detected.mime })
  );

  const saved = await prisma.upload.create({
    data: {
      id: uuid,
      eventId: opts.eventId,
      originalName: opts.filename,
      storedName,
      mimeType: detected.mime!,
      size,
      relativePath: relativeOriginal,
      deviceId: opts.deviceId,
    },
  });

  scheduleMirror(originalPath, relativeOriginal, opts.isOverflow);
  scheduleMirror(metaFile, `events/${opts.eventId}/metadata/${uuid}.json`, opts.isOverflow);
  debugLog('info', 'upload.saved', {
    eventId: opts.eventId,
    name: opts.filename,
    mime: detected.mime || '',
    size,
  });
  return {
    id: saved.id,
    originalName: saved.originalName,
    mimeType: saved.mimeType,
    size: saved.size,
    createdAt: saved.createdAt,
  };
}
