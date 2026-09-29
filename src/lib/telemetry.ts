import { getThumbQueueStats } from './thumb-queue';

export interface RecentUploadItem {
  id: string;
  eventId: string;
  eventName?: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  timestamp: number;
  device: string;
}

interface ByteSample {
  t: number;
  b: number;
}

class TelemetryTracker {
  private inSamples: ByteSample[] = [];
  private outSamples: ByteSample[] = [];
  private activeIps = new Map<string, number>();
  private recentUploads: RecentUploadItem[] = [];

  private peakInboundBytesPerSec = 0;
  private peakOutboundBytesPerSec = 0;

  private totalInboundBytes = 0;
  private totalOutboundBytes = 0;
  private totalUploadsCount = 0;

  private startTime = Date.now();

  /** Parse simplified device string from User-Agent */
  private parseDevice(ua?: string): string {
    if (!ua) return 'Unknown';
    const lower = ua.toLowerCase();
    if (lower.includes('iphone')) return 'iPhone';
    if (lower.includes('ipad')) return 'iPad';
    if (lower.includes('android')) return 'Android';
    if (lower.includes('macintosh') || lower.includes('mac os')) return 'Mac';
    if (lower.includes('windows')) return 'Windows';
    if (lower.includes('linux')) return 'Linux';
    return 'Mobile / Web';
  }

  public recordInbound(bytes: number, ip?: string) {
    if (bytes <= 0) return;
    const now = Date.now();
    this.inSamples.push({ t: now, b: bytes });
    this.totalInboundBytes += bytes;
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      this.activeIps.set(ip, now);
    }
    this.prune(now);
  }

  public recordOutbound(bytes: number, ip?: string) {
    if (bytes <= 0) return;
    const now = Date.now();
    this.outSamples.push({ t: now, b: bytes });
    this.totalOutboundBytes += bytes;
    if (ip && ip !== '127.0.0.1' && ip !== '::1') {
      this.activeIps.set(ip, now);
    }
    this.prune(now);
  }

  public recordUpload(item: {
    id: string;
    eventId: string;
    eventName?: string;
    fileName: string;
    sizeBytes: number;
    mimeType: string;
    ip?: string;
    userAgent?: string;
  }) {
    const now = Date.now();
    this.totalUploadsCount += 1;
    this.recordInbound(item.sizeBytes, item.ip);

    const uploadItem: RecentUploadItem = {
      id: item.id,
      eventId: item.eventId,
      eventName: item.eventName,
      fileName: item.fileName,
      sizeBytes: item.sizeBytes,
      mimeType: item.mimeType,
      timestamp: now,
      device: this.parseDevice(item.userAgent),
    };

    this.recentUploads.unshift(uploadItem);
    if (this.recentUploads.length > 20) {
      this.recentUploads.pop();
    }
  }

  private prune(now = Date.now()) {
    const windowStart = now - 60_000;
    while (this.inSamples.length > 0 && this.inSamples[0].t < windowStart) {
      this.inSamples.shift();
    }
    while (this.outSamples.length > 0 && this.outSamples[0].t < windowStart) {
      this.outSamples.shift();
    }
    // Prune active IPs older than 5 minutes
    const ipExpiry = now - 300_000;
    for (const [ip, lastSeen] of this.activeIps.entries()) {
      if (lastSeen < ipExpiry) {
        this.activeIps.delete(ip);
      }
    }
  }

  public getSnapshot(now = Date.now()) {
    this.prune(now);

    // Calculate rates over last 5 seconds
    const rateWindow = 5_000;
    const rateStart = now - rateWindow;

    let inBytes5s = 0;
    for (let i = this.inSamples.length - 1; i >= 0; i--) {
      if (this.inSamples[i].t >= rateStart) {
        inBytes5s += this.inSamples[i].b;
      } else {
        break;
      }
    }

    let outBytes5s = 0;
    for (let i = this.outSamples.length - 1; i >= 0; i--) {
      if (this.outSamples[i].t >= rateStart) {
        outBytes5s += this.outSamples[i].b;
      } else {
        break;
      }
    }

    const inboundSpeedBps = Math.round(inBytes5s / (rateWindow / 1000));
    const outboundSpeedBps = Math.round(outBytes5s / (rateWindow / 1000));

    if (inboundSpeedBps > this.peakInboundBytesPerSec) {
      this.peakInboundBytesPerSec = inboundSpeedBps;
    }
    if (outboundSpeedBps > this.peakOutboundBytesPerSec) {
      this.peakOutboundBytesPerSec = outboundSpeedBps;
    }

    // 15-minute totals
    const window15m = now - 900_000;
    let inBytes15m = 0;
    for (let i = this.inSamples.length - 1; i >= 0; i--) {
      if (this.inSamples[i].t >= window15m) {
        inBytes15m += this.inSamples[i].b;
      } else {
        break;
      }
    }

    const queueStats = getThumbQueueStats();

    return {
      now,
      uptimeSeconds: Math.floor((now - this.startTime) / 1000),
      inbound: {
        currentSpeedBps: inboundSpeedBps,
        currentSpeedMBps: +(inboundSpeedBps / (1024 * 1024)).toFixed(2),
        peakSpeedMBps: +(this.peakInboundBytesPerSec / (1024 * 1024)).toFixed(2),
        last15mBytes: inBytes15m,
        last15mMB: +(inBytes15m / (1024 * 1024)).toFixed(2),
        totalBytes: this.totalInboundBytes,
        totalMB: +(this.totalInboundBytes / (1024 * 1024)).toFixed(2),
        totalUploads: this.totalUploadsCount,
      },
      outbound: {
        currentSpeedBps: outboundSpeedBps,
        currentSpeedMBps: +(outboundSpeedBps / (1024 * 1024)).toFixed(2),
        peakSpeedMBps: +(this.peakOutboundBytesPerSec / (1024 * 1024)).toFixed(2),
        totalBytes: this.totalOutboundBytes,
        totalMB: +(this.totalOutboundBytes / (1024 * 1024)).toFixed(2),
      },
      activeGuests: Math.max(this.activeIps.size, this.inSamples.length > 0 ? 1 : 0),
      thumbQueue: {
        inFlight: queueStats.inFlight,
        pending: queueStats.pending,
        maxInFlight: queueStats.maxInFlight,
      },
      recentUploads: this.recentUploads.slice(0, 10),
    };
  }
}

// Persist singleton on globalThis across Next.js rebuilds/HMR
declare const globalThis: {
  telemetryTrackerSingleton?: TelemetryTracker;
} & typeof global;

if (!globalThis.telemetryTrackerSingleton) {
  globalThis.telemetryTrackerSingleton = new TelemetryTracker();
}

export const telemetry = globalThis.telemetryTrackerSingleton;
