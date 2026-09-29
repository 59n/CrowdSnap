/**
 * Host-vs-container replica SSD status.
 * Docker Desktop virtiofs binds of /Volumes/* go stale (EBADF) after the
 * drive remounts; the site must keep running, and a host watcher recreates
 * the web container only when the Mac has the volume and the container does not.
 */

import fs from 'fs';

export type ReplicaMountState = 'unconfigured' | 'ok' | 'unplugged' | 'bind_stale';

export function replicaVolumeRoot(replicaPath: string): string | null {
  const trimmed = (replicaPath || '').trim();
  if (!trimmed) return null;
  // /Volumes/<name>/... — name may contain spaces ("Backup SSD")
  const m = trimmed.match(/^\/Volumes\/([^/]+)/);
  if (!m) return null;
  return `/Volumes/${m[1]}`;
}

export function shouldRecreateSsdBind(opts: {
  hostMounted: boolean;
  containerReachable: boolean;
}): boolean {
  return opts.hostMounted && !opts.containerReachable;
}

export function classifyReplicaMount(opts: {
  configured: boolean;
  reachable: boolean;
  hostMounted: boolean | null;
}): ReplicaMountState {
  if (!opts.configured) return 'unconfigured';
  if (opts.reachable) return 'ok';
  if (opts.hostMounted === true) return 'bind_stale';
  return 'unplugged';
}

export type HostAlertLevel = 'critical' | 'time-sensitive' | 'active';

export interface HostAlert {
  key: string;
  title: string;
  message: string;
  level: HostAlertLevel;
  threadId: string;
  recovered?: boolean;
}

export interface HostAlertInput {
  replicaConfigured: boolean;
  containerRunning: boolean;
  hostMounted: boolean;
  containerReachable: boolean;
  macFreeGB: number | null;
  ssdFreeGB: number | null;
  macLowThresholdGB: number;
  recreateFailed?: boolean;
}

/**
 * Host-watch conditions that should page via brrr.
 * Recovery rows are always emitted when healthy; sendCriticalAlert drops
 * them unless that key was previously open.
 */
export function decideHostAlerts(input: HostAlertInput): HostAlert[] {
  const alerts: HostAlert[] = [];
  const ssdThread = 'crowdsnap-ssd';
  const webThread = 'crowdsnap-web';
  const diskThread = 'crowdsnap-storage';

  if (input.replicaConfigured) {
    if (!input.hostMounted) {
      alerts.push({
        key: 'ssd.unplugged',
        title: 'Backup SSD unplugged',
        message: 'The replica drive is not mounted. Uploads stay on the Mac until it is plugged back in.',
        level: 'critical',
        threadId: ssdThread,
      });
    } else {
      alerts.push({
        key: 'ssd.unplugged',
        title: 'Backup SSD unplugged',
        message: 'The replica drive is mounted again.',
        level: 'critical',
        threadId: ssdThread,
        recovered: true,
      });
    }

    if (input.hostMounted && input.containerRunning && !input.containerReachable) {
      alerts.push({
        key: 'ssd.bind_stale',
        title: 'SSD bind stale',
        message: 'The Mac has the drive, but Docker cannot write it. The watcher will recreate the web container.',
        level: 'time-sensitive',
        threadId: ssdThread,
      });
    } else if (input.containerReachable) {
      alerts.push({
        key: 'ssd.bind_stale',
        title: 'SSD bind stale',
        message: 'Docker can write the replica again.',
        level: 'time-sensitive',
        threadId: ssdThread,
        recovered: true,
      });
    }
  }

  if (input.recreateFailed) {
    alerts.push({
      key: 'ssd.recreate_failed',
      title: 'SSD remount failed',
      message: 'docker compose could not recreate the web container with the SSD overlay.',
      level: 'critical',
      threadId: ssdThread,
    });
  }

  if (!input.containerRunning) {
    alerts.push({
      key: 'web.down',
      title: 'CrowdSnap web is down',
      message: 'The wedding-web container is not running. Guest uploads will fail until it is back.',
      level: 'critical',
      threadId: webThread,
    });
  } else {
    alerts.push({
      key: 'web.down',
      title: 'CrowdSnap web is down',
      message: 'The web container is running again.',
      level: 'critical',
      threadId: webThread,
      recovered: true,
    });
  }

  if (input.macFreeGB !== null && input.macFreeGB < input.macLowThresholdGB) {
    alerts.push({
      key: 'disk.mac_low',
      title: 'Mac disk critically low',
      message: `Only ${input.macFreeGB.toFixed(1)} GB free on the Mac (threshold ${input.macLowThresholdGB} GB).`,
      level: 'critical',
      threadId: diskThread,
    });
  } else if (input.macFreeGB !== null) {
    alerts.push({
      key: 'disk.mac_low',
      title: 'Mac disk critically low',
      message: `Mac disk has ${input.macFreeGB.toFixed(1)} GB free.`,
      level: 'critical',
      threadId: diskThread,
      recovered: true,
    });
  }

  const ssdLowGB = 5;
  if (input.ssdFreeGB !== null && input.ssdFreeGB < ssdLowGB) {
    alerts.push({
      key: 'disk.ssd_low',
      title: 'Backup SSD disk low',
      message: `Only ${input.ssdFreeGB.toFixed(1)} GB free on the replica SSD.`,
      level: 'time-sensitive',
      threadId: diskThread,
    });
  } else if (input.ssdFreeGB !== null) {
    alerts.push({
      key: 'disk.ssd_low',
      title: 'Backup SSD disk low',
      message: `Replica SSD has ${input.ssdFreeGB.toFixed(1)} GB free.`,
      level: 'time-sensitive',
      threadId: diskThread,
      recovered: true,
    });
  }

  return alerts;
}

export interface SsdHostStatus {
  hostMounted: boolean;
  containerReachable: boolean;
  volumeRoot: string;
  replicaPath: string;
  action: 'noop' | 'recreate';
  at: string;
}

export function loadSsdHostStatus(statusPath: string): SsdHostStatus | null {
  try {
    const raw = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as Partial<SsdHostStatus>;
    if (typeof raw.hostMounted !== 'boolean') return null;
    return {
      hostMounted: raw.hostMounted,
      containerReachable: Boolean(raw.containerReachable),
      volumeRoot: String(raw.volumeRoot || ''),
      replicaPath: String(raw.replicaPath || ''),
      action: raw.action === 'recreate' ? 'recreate' : 'noop',
      at: String(raw.at || ''),
    };
  } catch {
    return null;
  }
}
