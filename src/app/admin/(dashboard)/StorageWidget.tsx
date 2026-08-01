"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, AlertTriangle, CheckCircle2, RefreshCw, Usb, ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useTranslation } from "@/components/TranslationProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StorageData {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  percentage: number;
  freeImmediateGB?: number;
  matchesSystemSettings?: boolean;
  isWarning: boolean;
  isCritical: boolean;
  isOverflow: boolean;
  overflowReady: boolean;
  volumeLabel?: string;
  replica?: {
    totalGB: number;
    freeGB: number;
    usedGB: number;
    percentage: number;
  } | null;
}

interface ReplicaStatus {
  configured: boolean;
  mounted: boolean;
  path?: string;
  primaryCount?: number;
  replicaCount?: number;
  dbCount?: number;
  missingOnReplica?: number;
  missingOnPrimary?: number;
  missingOriginalsOnReplica?: number;
  missingOriginalsOnPrimary?: number;
  inSync?: boolean;
  orphanFiles?: number;
  orphanOriginals?: number;
}

interface OverflowStatus {
  overrideMode: 'on' | 'off' | 'auto';
  isOverflow: boolean;
}

export default function StorageWidget() {
  const [data, setData] = useState<StorageData | null>(null);
  const [replica, setReplica] = useState<ReplicaStatus | null>(null);
  const [overflow, setOverflow] = useState<OverflowStatus | null>(null);
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState<'to_replica' | 'to_primary' | 'both' | null>(null);
  const [purgingOrphans, setPurgingOrphans] = useState(false);
  const [togglingOverflow, setTogglingOverflow] = useState(false);
  const { t } = useTranslation();

  const fetchStorage = useCallback(() => {
    fetch('/api/admin/storage')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  const fetchReplica = useCallback(() => {
    fetch('/api/admin/storage/sync')
      .then(res => res.ok ? res.json() : null)
      .then(d => d && setReplica(d))
      .catch(() => {});
  }, []);

  const fetchOverflow = useCallback(() => {
    fetch('/api/admin/storage/overflow')
      .then(res => res.ok ? res.json() : null)
      .then(d => d && setOverflow(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStorage();
    fetchReplica();
    fetchOverflow();

    const interval = setInterval(() => {
      fetchStorage();
      fetchReplica();
      fetchOverflow();
    }, 15_000);
    return () => clearInterval(interval);
  }, [fetchStorage, fetchReplica, fetchOverflow]);

  async function handleSync(direction: 'to_replica' | 'to_primary' | 'both') {
    setSyncing(direction);
    try {
      const res = await fetch('/api/admin/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Sync failed');
      } else {
        const parts: string[] = [];
        if (d.toReplica?.copied) parts.push(`${d.toReplica.copied} → SSD`);
        if (d.toPrimary?.copied) parts.push(`${d.toPrimary.copied} → Mac`);
        if (parts.length === 0) {
          toast.success(d.remaining?.inSync ? 'Already in sync' : `No files copied (${d.skipped ?? 0} skipped)`);
        } else {
          toast.success(
            `Synced: ${parts.join(', ')}` +
            (d.failed > 0 ? `, ${d.failed} failed` : '') +
            (d.remaining?.inSync ? ' — fully in sync' : '')
          );
        }
        fetchReplica();
        fetchStorage();
      }
    } catch {
      toast.error('Sync request failed');
    } finally {
      setSyncing(null);
    }
  }

  async function handlePurgeOrphans() {
    setPurgingOrphans(true);
    try {
      const res = await fetch('/api/admin/storage/orphans', { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) {
        toast.error(d.error || 'Cleanup failed');
      } else {
        toast.success(
          d.deleted === 0
            ? 'No orphan files found'
            : `Removed ${d.deleted} orphan file${d.deleted === 1 ? '' : 's'}` +
              (d.failed ? ` (${d.failed} failed)` : '')
        );
        fetchReplica();
        fetchStorage();
      }
    } catch {
      toast.error('Cleanup request failed');
    } finally {
      setPurgingOrphans(false);
    }
  }

  async function handleToggleOverflow(mode: 'on' | 'off' | 'auto') {
    setTogglingOverflow(true);
    try {
      const res = await fetch('/api/admin/storage/overflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const d = await res.json();
      if (res.ok) {
        setOverflow(d);
        toast.success(
          mode === 'on'   ? 'Overflow forced ON — new uploads go to SSD first' :
          mode === 'off'  ? 'Overflow forced OFF — new uploads go to Mac first' :
                            'Overflow back to auto mode'
        );
        fetchStorage();
      }
    } catch {
      toast.error('Failed to toggle overflow');
    } finally {
      setTogglingOverflow(false);
    }
  }

  if (error) return null;

  if (!data) {
    return (
      <div className="rounded-lg bg-muted/40 border border-border/40 p-3 space-y-2 animate-pulse">
        <div className="h-3 bg-muted rounded w-24" />
        <div className="h-1.5 bg-muted rounded-full w-full" />
        <div className="h-3 bg-muted rounded w-16" />
      </div>
    );
  }

  const statusColor = data.isCritical ? "text-destructive" : data.isWarning ? "text-amber-500" : "text-muted-foreground";
  const barColor    = data.isCritical ? "bg-destructive"   : data.isWarning ? "bg-amber-500"  : "bg-primary";
  const Icon        = data.isCritical || data.isWarning ? AlertTriangle : CheckCircle2;

  const overrideMode = overflow?.overrideMode ?? 'auto';
  const isOverflow   = overflow?.isOverflow ?? data.isOverflow;

  const missingToSsd = replica?.missingOnReplica ?? 0;
  const missingToMac = replica?.missingOnPrimary ?? 0;
  const missingOrigToSsd = replica?.missingOriginalsOnReplica ?? Math.max(0, (replica?.primaryCount ?? 0) - (replica?.replicaCount ?? 0));
  const missingOrigToMac = replica?.missingOriginalsOnPrimary ?? Math.max(0, (replica?.replicaCount ?? 0) - (replica?.primaryCount ?? 0));

  return (
    <div className="space-y-2">
      {/* Primary storage — Mac volume hosting the app storage folder */}
      <div className={`rounded-lg border px-3 py-2.5 space-y-2 text-xs ${
        data.isCritical ? "border-destructive/40 bg-destructive/5" :
        data.isWarning  ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10" :
                          "border-border/40 bg-muted/20"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <HardDrive className="w-3.5 h-3.5" />
            {data.volumeLabel || t("storage.capacity")}
          </div>
          <Icon className={`w-3 h-3 ${statusColor}`} />
        </div>

        <div className="w-full bg-muted/60 h-1 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(100, data.percentage)}%` }} />
        </div>

        <div className="flex items-center justify-between">
          <span className={`font-semibold ${statusColor}`}>{data.freeGB.toFixed(1)} GB {t("storage.free")}</span>
          <span className="text-muted-foreground/70">{data.usedGB.toFixed(0)} / {data.totalGB.toFixed(0)} GB</span>
        </div>

        <p className="text-[10px] text-muted-foreground/60 leading-snug">
          {data.matchesSystemSettings
            ? 'Same free space as macOS Settings (includes reclaimable space)'
            : 'System volume free space (not app folder size)'}
        </p>

        {data.isWarning && (
          <p className={`text-[10px] leading-snug font-medium ${statusColor}`}>
            {data.isCritical
              ? `Low free space (${data.freeGB.toFixed(1)} GB). Overflow may divert new uploads to SSD.`
              : `Free space getting low (${data.freeGB.toFixed(1)} GB remaining).`}
          </p>
        )}

        {isOverflow && (
          <p className="text-[10px] font-medium text-blue-500">
            {overrideMode === 'on' ? '⚡ Overflow forced ON — uploads → SSD first' : '⚡ Auto overflow — uploads → SSD first'}
          </p>
        )}

        {data.overflowReady && !isOverflow && !data.isWarning && (
          <p className="text-[10px] text-muted-foreground/60">SSD overflow ready (&lt;10 GB free on Mac triggers auto)</p>
        )}
      </div>

      {/* Manual overflow toggle */}
      {data.overflowReady && (
        <div className="rounded-lg border border-border/40 px-3 py-2.5 space-y-2 text-xs bg-muted/10">
          <p className="text-muted-foreground font-medium">Overflow mode</p>
          <div className="flex gap-1.5">
            {(['on', 'auto', 'off'] as const).map(mode => (
              <button
                key={mode}
                disabled={togglingOverflow}
                onClick={() => handleToggleOverflow(mode)}
                className={`flex-1 py-1 rounded text-[10px] font-semibold capitalize border transition-colors ${
                  overrideMode === mode
                    ? mode === 'on'  ? 'bg-blue-500 text-white border-blue-500' :
                      mode === 'off' ? 'bg-destructive/80 text-white border-destructive/80' :
                                       'bg-primary text-primary-foreground border-primary'
                    : 'border-border/50 text-muted-foreground hover:border-border'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/60 leading-snug">
            {overrideMode === 'on'  ? 'New uploads land on SSD first, then mirror to Mac if space allows.' :
             overrideMode === 'off' ? 'Overflow disabled — Mac primary only (still mirrors to SSD).' :
                                      'Auto: SSD-first when Mac free space &lt; 10 GB.'}
          </p>
        </div>
      )}

      {/* Replica / external SSD */}
      {replica?.configured && (
        <div className={`rounded-lg border px-3 py-2.5 space-y-2 text-xs ${
          !replica.mounted      ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10" :
          replica.inSync        ? "border-border/40 bg-muted/20" :
                                  "border-blue-400/30 bg-blue-50/30 dark:bg-blue-950/10"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Usb className="w-3.5 h-3.5" />
              <span>Backup SSD</span>
            </div>
            {!replica.mounted   ? <AlertTriangle className="w-3 h-3 text-amber-500" /> :
             replica.inSync     ? <CheckCircle2 className="w-3 h-3 text-green-500" /> :
                                  <AlertTriangle className="w-3 h-3 text-blue-500" />}
          </div>

          {!replica.mounted ? (
            <p className="text-[10px] text-amber-600 font-medium">SSD not mounted</p>
          ) : (
            <>
              {data.replica && (
                <div className="flex items-center justify-between text-muted-foreground/80">
                  <span>{data.replica.freeGB.toFixed(0)} GB free on SSD</span>
                  <span>{data.replica.totalGB.toFixed(0)} GB total</span>
                </div>
              )}

              <div className="flex flex-col gap-0.5 text-muted-foreground/80">
                <span>
                  In gallery: {replica.dbCount ?? '—'} · disk: {replica.primaryCount ?? 0} Mac / {replica.replicaCount ?? 0} SSD
                </span>
                {replica.inSync ? (
                  <span className="text-green-600 font-medium">Known uploads in sync</span>
                ) : (
                  <span className="text-blue-600">
                    {missingToSsd > 0 && `${missingToSsd} file${missingToSsd === 1 ? '' : 's'} missing on SSD`}
                    {missingToSsd > 0 && missingToMac > 0 && ' · '}
                    {missingToMac > 0 && `${missingToMac} file${missingToMac === 1 ? '' : 's'} missing on Mac`}
                  </span>
                )}
              </div>

              {(replica.orphanOriginals ?? 0) > 0 && (
                <div className="space-y-1.5 pt-0.5">
                  <p className="text-[10px] text-amber-600 font-medium leading-snug">
                    {replica.orphanOriginals} orphan file{(replica.orphanOriginals ?? 0) === 1 ? '' : 's'} on disk
                    (deleted from gallery but still on Mac/SSD)
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-6 text-[10px] gap-1 border-amber-500/40 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                    onClick={handlePurgeOrphans}
                    disabled={purgingOrphans || syncing !== null}
                  >
                    <RefreshCw className={`w-3 h-3 ${purgingOrphans ? "animate-spin" : ""}`} />
                    {purgingOrphans ? "Cleaning…" : "Remove orphan files"}
                  </Button>
                </div>
              )}

              {!replica.inSync && (
                <div className="flex flex-col gap-1.5">
                  {(missingToSsd > 0 && missingToMac > 0) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-6 text-[10px] gap-1"
                      onClick={() => handleSync('both')}
                      disabled={syncing !== null}
                    >
                      <ArrowLeftRight className={`w-3 h-3 ${syncing === 'both' ? "animate-spin" : ""}`} />
                      {syncing === 'both' ? "Syncing both ways…" : "Sync both ways"}
                    </Button>
                  )}

                  {missingToSsd > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-6 text-[10px] gap-1"
                      onClick={() => handleSync('to_replica')}
                      disabled={syncing !== null}
                    >
                      <ArrowUpFromLine className={`w-3 h-3 ${syncing === 'to_replica' ? "animate-spin" : ""}`} />
                      {syncing === 'to_replica'
                        ? "Copying to SSD…"
                        : `Copy ${missingOrigToSsd || missingToSsd} → SSD`}
                    </Button>
                  )}

                  {missingToMac > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full h-6 text-[10px] gap-1 border-blue-400/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                      onClick={() => handleSync('to_primary')}
                      disabled={syncing !== null}
                    >
                      <ArrowDownToLine className={`w-3 h-3 ${syncing === 'to_primary' ? "animate-spin" : ""}`} />
                      {syncing === 'to_primary'
                        ? "Copying to Mac…"
                        : `Copy ${missingOrigToMac || missingToMac} → Mac`}
                    </Button>
                  )}
                </div>
              )}

              {replica.inSync && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full h-6 text-[10px] gap-1 text-muted-foreground"
                  onClick={() => handleSync('both')}
                  disabled={syncing !== null}
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Checking…" : "Re-check sync"}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
