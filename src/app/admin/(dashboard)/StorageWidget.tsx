"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, AlertTriangle, CheckCircle2, RefreshCw, Usb, ArrowLeftRight } from "lucide-react";
import { useTranslation } from "@/components/TranslationProvider";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface StorageData {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  percentage: number;
  isWarning: boolean;
  isCritical: boolean;
  isOverflow: boolean;
  overflowReady: boolean;
}

interface ReplicaStatus {
  configured: boolean;
  mounted: boolean;
  path?: string;
  primaryCount?: number;
  replicaCount?: number;
  inSync?: boolean;
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
  const [syncing, setSyncing] = useState(false);
  const [syncingBack, setSyncingBack] = useState(false);
  const [togglingOverflow, setTogglingOverflow] = useState(false);
  const { t } = useTranslation();

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
    fetch('/api/admin/storage')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(setData)
      .catch(() => setError(true));

    fetchReplica();
    fetchOverflow();

    const interval = setInterval(() => { fetchReplica(); fetchOverflow(); }, 15_000);
    return () => clearInterval(interval);
  }, [fetchReplica, fetchOverflow]);

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'to_replica' }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Sync failed'); }
      else {
        toast.success(`Synced: ${d.copied} copied, ${d.skipped} already up-to-date${d.failed > 0 ? `, ${d.failed} failed` : ''}`);
        fetchReplica();
      }
    } catch { toast.error('Sync request failed'); }
    finally { setSyncing(false); }
  }

  async function handleSyncBack() {
    setSyncingBack(true);
    try {
      const res = await fetch('/api/admin/storage/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'to_primary' }),
      });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Sync back failed'); }
      else {
        toast.success(`Synced back: ${d.copied} copied to primary, ${d.skipped} already there${d.failed > 0 ? `, ${d.failed} failed` : ''}`);
        fetchReplica();
      }
    } catch { toast.error('Sync back request failed'); }
    finally { setSyncingBack(false); }
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
          mode === 'on'   ? 'Overflow forced ON — new uploads go to SSD' :
          mode === 'off'  ? 'Overflow forced OFF — new uploads go to primary' :
                            'Overflow back to auto mode'
        );
      }
    } catch { toast.error('Failed to toggle overflow'); }
    finally { setTogglingOverflow(false); }
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

  return (
    <div className="space-y-2">
      {/* Primary storage */}
      <div className={`rounded-lg border px-3 py-2.5 space-y-2 text-xs ${
        data.isCritical ? "border-destructive/40 bg-destructive/5" :
        data.isWarning  ? "border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/10" :
                          "border-border/40 bg-muted/20"
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
            <HardDrive className="w-3.5 h-3.5" />
            {t("storage.capacity")}
          </div>
          <Icon className={`w-3 h-3 ${statusColor}`} />
        </div>

        <div className="w-full bg-muted/60 h-1 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(100, data.percentage)}%` }} />
        </div>

        <div className="flex items-center justify-between">
          <span className={`font-semibold ${statusColor}`}>{data.freeGB.toFixed(1)} GB {t("storage.free")}</span>
          <span className="text-muted-foreground/70">{data.percentage.toFixed(0)}%</span>
        </div>

        {data.isWarning && (
          <p className={`text-[10px] leading-snug font-medium ${statusColor}`}>
            {data.isCritical ? t("storage.critical") : t("storage.warning")}
          </p>
        )}

        {isOverflow && (
          <p className="text-[10px] font-medium text-blue-500">
            {overrideMode === 'on' ? '⚡ Overflow forced ON — uploads → SSD' : '⚡ Auto overflow active — uploads → SSD'}
          </p>
        )}

        {data.overflowReady && !isOverflow && !data.isWarning && (
          <p className="text-[10px] text-muted-foreground/60">SSD overflow ready</p>
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
            {overrideMode === 'on'  ? 'All new uploads go to SSD regardless of space.' :
             overrideMode === 'off' ? 'Overflow disabled — primary only.' :
                                      'Auto: diverts when primary hits 90% full.'}
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
              <div className="flex flex-col gap-0.5 text-muted-foreground/80">
                <span>{replica.replicaCount} / {replica.primaryCount} uploads synced</span>
                {replica.inSync && <span className="text-green-600 font-medium">In sync</span>}
              </div>

              {!replica.inSync && (
                <Button size="sm" variant="outline" className="w-full h-6 text-[10px] gap-1" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing…" : `Sync ${(replica.primaryCount ?? 0) - (replica.replicaCount ?? 0)} missing uploads`}
                </Button>
              )}

              {/* Sync back: copies replica files missing from primary */}
              {(replica.replicaCount ?? 0) > (replica.primaryCount ?? 0) && (
                <Button size="sm" variant="outline" className="w-full h-6 text-[10px] gap-1 border-blue-400/50 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20" onClick={handleSyncBack} disabled={syncingBack}>
                  <ArrowLeftRight className={`w-3 h-3 ${syncingBack ? "animate-spin" : ""}`} />
                  {syncingBack ? "Copying back…" : `Copy ${(replica.replicaCount ?? 0) - (replica.primaryCount ?? 0)} uploads back to primary`}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
