import fs from 'fs';
import path from 'path';

const BASE_PATH = process.env.STORAGE_PATH || './storage';

export function getEventStoragePath(eventId: string) {
  return path.join(BASE_PATH, 'events', eventId);
}

export function getFilePath(eventId: string, type: 'originals' | 'thumbs' | 'metadata', filename: string) {
  return path.join(getEventStoragePath(eventId), type, filename);
}

export function initBaseStorage() {
  if (!fs.existsSync(BASE_PATH)) {
    fs.mkdirSync(BASE_PATH, { recursive: true });
  }
}

export function initEventStorage(eventId: string) {
  const eventPath = getEventStoragePath(eventId);
  const dirs = ['originals', 'thumbs', 'metadata'];

  for (const dir of dirs) {
    const dirPath = path.join(eventPath, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}

// Ensure base storage is initialized on file inclusion
try {
  initBaseStorage();
} catch (e) {
  console.error('Failed to initialize local storage path:', e);
}
