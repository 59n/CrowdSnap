"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Activity,
  Users,
  Layers,
  RefreshCw,
  Smartphone,
  HardDrive,
  Clock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface RecentUpload {
  id: string;
  eventId: string;
  eventName?: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  timestamp: number;
  device: string;
}

interface TelemetryData {
  now: number;
  uptimeSeconds: number;
  inbound: {
    currentSpeedBps: number;
    currentSpeedMBps: number;
    peakSpeedMBps: number;
    last15mBytes: number;
    last15mMB: number;
    totalBytes: number;
    totalMB: number;
    totalUploads: number;
  };
  outbound: {
    currentSpeedBps: number;
    currentSpeedMBps: number;
    peakSpeedMBps: number;
    totalBytes: number;
    totalMB: number;
  };
  activeGuests: number;
  thumbQueue: {
    inFlight: number;
    pending: number;
    maxInFlight: number;
  };
  recentUploads: RecentUpload[];
  storage?: {
    primary?: {
      totalGB: number;
      usedGB: number;
      freeGB: number;
      percentage: number;
    } | null;
    replica?: {
      totalGB: number;
      usedGB: number;
      freeGB: number;
      percentage: number;
    } | null;
  };
}

function formatSpeed(mbps: number): { value: string; unit: string } {
  if (mbps < 0.01) return { value: "0", unit: "KB/s" };
  if (mbps < 1) return { value: (mbps * 1024).toFixed(0), unit: "KB/s" };
  return { value: mbps.toFixed(2), unit: "MB/s" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function timeAgo(timestamp: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export default function LiveThroughputWidget() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isPending, startTransition] = useTransition();

  const fetchTelemetry = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/telemetry");
      if (!res.ok) return;
      const json: TelemetryData = await res.json();
      startTransition(() => {
        setData(json);
      });
    } catch {
      // Ignore background fetch errors
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();
    if (!autoRefresh) return;
    const interval = setInterval(fetchTelemetry, 3000);
    return () => clearInterval(interval);
  }, [fetchTelemetry, autoRefresh]);

  const inSpeed = data ? formatSpeed(data.inbound.currentSpeedMBps) : { value: "0", unit: "KB/s" };
  const outSpeed = data ? formatSpeed(data.outbound.currentSpeedMBps) : { value: "0", unit: "KB/s" };

  return (
    <Card className="border-border/70 shadow-sm overflow-hidden bg-gradient-to-b from-card to-card/70">
      <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold tracking-tight flex items-center gap-2">
                Live Event Telemetry
                <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider text-muted-foreground border-border/60">
                  Realtime
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Bandwidth ingestion, outbound gallery egress & processing queue
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className="text-xs h-7 px-2.5 font-normal"
            >
              {autoRefresh ? "Pause Live" : "Resume Live"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchTelemetry}
              disabled={isPending}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Refresh now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-5">
        {/* Core telemetry metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Inbound Rate */}
          <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <ArrowDownToLine className="w-3.5 h-3.5" />
                Inbound (Uploads)
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">600M Cap</span>
            </div>
            <div className="mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {inSpeed.value}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{inSpeed.unit}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Peak: <span className="font-mono">{data?.inbound.peakSpeedMBps ?? 0} MB/s</span> • 15m:{" "}
                <span className="font-mono">{data?.inbound.last15mMB ?? 0} MB</span>
              </p>
            </div>
          </div>

          {/* Outbound Rate */}
          <div className="p-3.5 rounded-xl border border-blue-500/20 bg-blue-500/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                Outbound (Gallery)
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">100M Cap</span>
            </div>
            <div className="mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {outSpeed.value}
                </span>
                <span className="text-xs font-medium text-muted-foreground">{outSpeed.unit}</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Peak: <span className="font-mono">{data?.outbound.peakSpeedMBps ?? 0} MB/s</span> • Delivered:{" "}
                <span className="font-mono">{data?.outbound.totalMB ?? 0} MB</span>
              </p>
            </div>
          </div>

          {/* Active Guests */}
          <div className="p-3.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-violet-700 dark:text-violet-400 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                Active Guests (5m)
              </span>
              <Activity className="w-3.5 h-3.5 text-violet-500/70" />
            </div>
            <div className="mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {data?.activeGuests ?? 0}
                </span>
                <span className="text-xs font-medium text-muted-foreground">devices</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Total uploads: <span className="font-mono font-medium">{data?.inbound.totalUploads ?? 0}</span>
              </p>
            </div>
          </div>

          {/* Thumbnail Queue */}
          <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                Thumbnail Queue
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">Sharp / Vips</span>
            </div>
            <div className="mt-2.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tracking-tight text-foreground font-mono">
                  {data?.thumbQueue.pending ?? 0}
                </span>
                <span className="text-xs font-medium text-muted-foreground">
                  queued ({data?.thumbQueue.inFlight ?? 0} active)
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Workers: <span className="font-mono">2 / 2 max</span> • Non-blocking
              </p>
            </div>
          </div>
        </div>

        {/* Live Recent Uploads Feed */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Recent Live Uploads Ticker
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Total Ingested: <span className="font-mono font-medium text-foreground">{data ? formatBytes(data.inbound.totalBytes) : "0 MB"}</span>
            </span>
          </div>

          {(!data?.recentUploads || data.recentUploads.length === 0) ? (
            <div className="p-4 rounded-lg border border-dashed border-border/80 text-center bg-muted/10">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground/60" />
                Ready for guests. New uploads from phones will stream here live in real-time.
              </p>
            </div>
          ) : (
            <div className="divide-y border-border/40 border border-border/60 rounded-lg overflow-hidden bg-background">
              {data.recentUploads.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-1 rounded bg-muted text-muted-foreground">
                      <Smartphone className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs block">
                        {item.fileName}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatBytes(item.sizeBytes)} • {item.device}
                        {item.eventName ? ` • ${item.eventName}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0 ml-3">
                    <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
                      {item.mimeType.split("/")[1] || "media"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
                      {timeAgo(item.timestamp, data.now)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick storage bar */}
        {data?.storage?.primary && (
          <div className="pt-2 border-t border-border/40 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-foreground/80" />
              <span>
                Server NVMe: <span className="font-medium text-foreground">{Number(data.storage.primary.freeGB).toFixed(1)} GB free</span> of {Number(data.storage.primary.totalGB).toFixed(1)} GB ({Math.round(data.storage.primary.percentage)}% used)
              </span>
            </div>
            {data.storage.replica && (
              <div className="flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                <span>
                  SSD Backup: <span className="font-medium text-foreground">{Number(data.storage.replica.freeGB).toFixed(1)} GB free</span> of {Number(data.storage.replica.totalGB).toFixed(1)} GB ({Math.round(data.storage.replica.percentage)}% used)
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
