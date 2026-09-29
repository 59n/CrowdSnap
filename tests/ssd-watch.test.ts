import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyReplicaMount,
  decideHostAlerts,
  replicaVolumeRoot,
  shouldRecreateSsdBind,
} from '../src/lib/ssd-watch';

describe('replicaVolumeRoot', () => {
  it('returns the /Volumes/<name> root from a replica path', () => {
    assert.equal(replicaVolumeRoot('/Volumes/1TB/wedding'), '/Volumes/1TB');
    assert.equal(replicaVolumeRoot('/Volumes/1TB'), '/Volumes/1TB');
    assert.equal(replicaVolumeRoot('/Volumes/Backup SSD/wedding'), '/Volumes/Backup SSD');
  });

  it('returns null for empty or non-volume paths', () => {
    assert.equal(replicaVolumeRoot(''), null);
    assert.equal(replicaVolumeRoot('./storage'), null);
    assert.equal(replicaVolumeRoot('/app/storage'), null);
  });
});

describe('shouldRecreateSsdBind', () => {
  it('recreates when the host has the SSD but the container cannot reach it', () => {
    assert.equal(
      shouldRecreateSsdBind({ hostMounted: true, containerReachable: false }),
      true
    );
  });

  it('does not recreate when the bind is healthy', () => {
    assert.equal(
      shouldRecreateSsdBind({ hostMounted: true, containerReachable: true }),
      false
    );
  });

  it('does not recreate when the SSD is unplugged (site must stay up)', () => {
    assert.equal(
      shouldRecreateSsdBind({ hostMounted: false, containerReachable: false }),
      false
    );
  });
});

describe('classifyReplicaMount', () => {
  it('reports unconfigured when no replica path is set', () => {
    assert.equal(
      classifyReplicaMount({ configured: false, reachable: false, hostMounted: null }),
      'unconfigured'
    );
  });

  it('reports ok when the container can write the replica', () => {
    assert.equal(
      classifyReplicaMount({ configured: true, reachable: true, hostMounted: true }),
      'ok'
    );
  });

  it('reports bind_stale when the Mac has the drive but Docker cannot see it', () => {
    assert.equal(
      classifyReplicaMount({ configured: true, reachable: false, hostMounted: true }),
      'bind_stale'
    );
  });

  it('reports unplugged when the Mac does not have the volume', () => {
    assert.equal(
      classifyReplicaMount({ configured: true, reachable: false, hostMounted: false }),
      'unplugged'
    );
  });

  it('reports unplugged when host status is unknown and replica is unreachable', () => {
    assert.equal(
      classifyReplicaMount({ configured: true, reachable: false, hostMounted: null }),
      'unplugged'
    );
  });
});

describe('decideHostAlerts', () => {
  const base = {
    replicaConfigured: true,
    containerRunning: true,
    hostMounted: true,
    containerReachable: true,
    macFreeGB: 80,
    ssdFreeGB: 400,
    macLowThresholdGB: 10,
    recreateFailed: false,
  };

  it('alerts when the SSD is unplugged and recovers when it returns', () => {
    const down = decideHostAlerts({ ...base, hostMounted: false, containerReachable: false });
    assert.ok(down.some((a) => a.key === 'ssd.unplugged' && !a.recovered && a.level === 'critical'));
    const up = decideHostAlerts({ ...base, hostMounted: true, containerReachable: true });
    assert.ok(up.some((a) => a.key === 'ssd.unplugged' && a.recovered));
  });

  it('alerts when Docker bind is stale', () => {
    const alerts = decideHostAlerts({
      ...base,
      hostMounted: true,
      containerReachable: false,
    });
    assert.ok(alerts.some((a) => a.key === 'ssd.bind_stale' && a.level === 'time-sensitive'));
  });

  it('alerts when the web container is down', () => {
    const alerts = decideHostAlerts({ ...base, containerRunning: false });
    assert.ok(alerts.some((a) => a.key === 'web.down' && a.level === 'critical'));
  });

  it('alerts when Mac disk is critically low', () => {
    const alerts = decideHostAlerts({ ...base, macFreeGB: 4 });
    assert.ok(alerts.some((a) => a.key === 'disk.mac_low' && a.level === 'critical'));
  });

  it('does not alert SSD unplugged when replica is unconfigured', () => {
    const alerts = decideHostAlerts({
      ...base,
      replicaConfigured: false,
      hostMounted: false,
      containerReachable: false,
    });
    assert.equal(alerts.some((a) => a.key === 'ssd.unplugged'), false);
  });
});
