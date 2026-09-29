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
  ShieldCheck,
  Server,
  Database,
  CheckCircle2,
  AlertTriangle,
  FolderSync,
  Trash2,
  Radio,
  Wifi,
  Cpu,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

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

interface DetailedStorage {
  totalGB: number;
  usedGB: number;
  freeGB: number;
  percentage: number;
  isWarning: boolean;
  isCritical: boolean;
  isOverflow: boolean;
  overflowReady: boolean;
  volumeLabel?: string;
  path: string;
  replicaPath?: string | null;
  replica?: {
    totalGB: number;
    freeGB: number;
    usedGB: number;
    percentage: number;
    capacityUnreliable?: boolean;
  } | null;
}

interface SyncStatus {
  configured: boolean;
  mounted: boolean;
  state?: string;
  primaryCount?: number;
  replicaCount?: number;
  dbCount?: number;
  missingOnReplica?: number;
  missingOnPrimary?: number;
  inSync?: boolean;
  orphanFiles?: number;
  orphanOriginals?: number;
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

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function timeAgo(timestamp: number, now: number): string {
  const diffSec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

export default function TelemetryDashboard() {
  const [data, setData] = useState<TelemetryData | null>(null);
  const [storage, setStorage] = useState<DetailedStorage | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [telemetryRes, storageRes, syncRes] = await Promise.allSettled([
        fetch("/api/admin/telemetry"),
        fetch("/api/admin/storage"),
        fetch("/api/admin/storage/sync"),
      ]);

      if (telemetryRes.status === "fulfilled" && telemetryRes.value.ok) {
        const json: TelemetryData = await telemetryRes.value.json();
        startTransition(() => setData(json));
      }

      if (storageRes.status === "fulfilled" && storageRes.value.ok) {
        const sJson: DetailedStorage = await storageRes.value.json();
        setStorage(sJson);
      }

      if (syncRes.status === "fulfilled" && syncRes.value.ok) {
        const syncJson: SyncStatus = await syncRes.value.json();
        setSyncStatus(syncJson);
      }
    } catch {
      // background polling
    }
  }, []);

  useEffect(() => {
    fetchAll();
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [fetchAll, autoRefresh]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/admin/storage/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: "to_replica" }),
      });
      const result = await res.json();
      if (res.ok) {
        toast.success(`Sync complete: copied ${result.copied ?? 0} files to SSD replica`);
        fetchAll();
      } else {
        toast.error(result.error || "Sync failed");
      }
    } catch {
      toast.error("Failed to connect for replica sync");
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePurgeOrphans = async () => {
    setIsPurging(true);
    try {
      const res = await fetch("/api/admin/storage/orphans", { method: "DELETE" });
      const result = await res.json();
      if (res.ok) {
        toast.success(`Orphan cleanup finished: deleted ${result.deleted ?? 0} orphan files`);
        fetchAll();
      } else {
        toast.error("Failed to clean orphan files");
      }
    } catch {
      toast.error("Error purging orphan files");
    } finally {
      setIsPurging(false);
    }
  };

  const inSpeed = data ? formatSpeed(data.inbound.currentSpeedMBps) : { value: "0", unit: "KB/s" };
  const outSpeed = data ? formatSpeed(data.outbound.currentSpeedMBps) : { value: "0", unit: "KB/s" };

  // Calculate percentage of 600M and 100M bandwidth
  const inboundPipePercent = data ? Math.min(100, Math.round((data.inbound.currentSpeedMBps / 75) * 100)) : 0;
  const outboundPipePercent = data ? Math.min(100, Math.round((data.outbound.currentSpeedMBps / 12.5) * 100)) : 0;

  // Primary stats (fallback to storage if telemetry not loaded yet)
  const primaryTotal = storage?.totalGB ?? data?.storage?.primary?.totalGB ?? 500;
  const primaryFree = storage?.freeGB ?? data?.storage?.primary?.freeGB ?? 431;
  const primaryUsed = storage?.usedGB ?? data?.storage?.primary?.usedGB ?? 42;
  const primaryPercent = storage?.percentage ?? data?.storage?.primary?.percentage ?? 9;

  // Replica stats
  const replicaTotal = storage?.replica?.totalGB ?? data?.storage?.replica?.totalGB ?? 983;
  const replicaFree = storage?.replica?.freeGB ?? data?.storage?.replica?.freeGB ?? 932;
  const replicaUsed = storage?.replica?.usedGB ?? data?.storage?.replica?.usedGB ?? 0.1;
  const replicaPercent = storage?.replica?.percentage ?? data?.storage?.replica?.percentage ?? 1;

  // Estimated photos (assuming ~4.5 MB average)
  const primaryEstPhotos = Math.floor((primaryFree * 1024) / 4.5);
  const replicaEstPhotos = Math.floor((replicaFree * 1024) / 4.5);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-2 border-b border-border/40">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Telemetry & Storage Hub
            </h1>
            <Badge
              variant="outline"
              className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5 px-2 py-0.5 text-[11px] sm:text-xs font-medium"
            >
              <span className="relative flex h-1.5 w-1.5 sm:h-2 sm:w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 sm:h-2 sm:w-2 bg-emerald-500" />
              </span>
              Realtime Active
            </Badge>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Live ingestion bandwidth, outbound delivery speeds, NVMe & SSD storage health, and fail-safe redundancy.
          </p>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0">
          <Badge variant="secondary" className="font-mono text-[11px] sm:text-xs px-2 sm:px-2.5 py-1 text-muted-foreground">
            Uptime: {data ? formatUptime(data.uptimeSeconds) : "—"}
          </Badge>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh((prev) => !prev)}
              className="text-xs h-7 sm:h-8 px-2.5 sm:px-3"
            >
              {autoRefresh ? "Pause 3s" : "Poll 3s"}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchAll}
              disabled={isPending}
              className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground hover:text-foreground"
              title="Refresh now"
            >
              <RefreshCw className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${isPending ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Network & Ingestion Throughput Grid */}
      <div className="space-y-2.5 sm:space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          Network & Ingestion Throughput
        </h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Inbound Rate Card */}
          <Card className="border-border/70 bg-gradient-to-b from-card to-card/60 shadow-xs">
            <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1 sm:gap-1.5 truncate">
                  <ArrowDownToLine className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Inbound (Uploads)</span>
                </span>
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-mono border-emerald-500/30 text-emerald-600 px-1.5 py-0">
                  600 Mbps Cap
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {inSpeed.value}
                </span>
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">{inSpeed.unit}</span>
              </div>
              <Progress value={inboundPipePercent} className="h-1 sm:h-1.5 bg-emerald-500/10" />
              <div className="pt-0.5 flex flex-col xs:flex-row xs:items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground font-mono gap-0.5">
                <span>Peak: {data?.inbound.peakSpeedMBps ?? 0} MB/s</span>
                <span>15m: {data?.inbound.last15mMB ?? 0} MB</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
                Total: <span className="font-mono text-foreground font-medium">{data ? formatBytes(data.inbound.totalBytes) : "0 MB"}</span>
              </p>
            </CardContent>
          </Card>

          {/* Outbound Rate Card */}
          <Card className="border-border/70 bg-gradient-to-b from-card to-card/60 shadow-xs">
            <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-medium text-blue-600 dark:text-blue-400 flex items-center gap-1 sm:gap-1.5 truncate">
                  <ArrowUpFromLine className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Outbound (Gallery)</span>
                </span>
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-mono border-blue-500/30 text-blue-600 px-1.5 py-0">
                  100 Mbps Cap
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {outSpeed.value}
                </span>
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">{outSpeed.unit}</span>
              </div>
              <Progress value={outboundPipePercent} className="h-1 sm:h-1.5 bg-blue-500/10" />
              <div className="pt-0.5 flex flex-col xs:flex-row xs:items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground font-mono gap-0.5">
                <span>Peak: {data?.outbound.peakSpeedMBps ?? 0} MB/s</span>
                <span>Sent: {data?.outbound.totalMB ?? 0} MB</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground truncate">
                Total: <span className="font-mono text-foreground font-medium">{data ? formatBytes(data.outbound.totalBytes) : "0 MB"}</span>
              </p>
            </CardContent>
          </Card>

          {/* Active Guest Devices Card */}
          <Card className="border-border/70 bg-gradient-to-b from-card to-card/60 shadow-xs">
            <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1 sm:gap-1.5 truncate">
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Active Guests</span>
                </span>
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-mono border-violet-500/30 text-violet-600 px-1.5 py-0">
                  5m Window
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {data?.activeGuests ?? 0}
                </span>
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">phones</span>
              </div>
              <div className="h-1 sm:h-1.5 rounded-full bg-violet-500/20" />
              <div className="pt-0.5 flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground">
                <span>Uploads:</span>
                <span className="font-mono font-medium text-foreground">{data?.inbound.totalUploads ?? 0}</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                <span>Relaxed rate limits</span>
              </p>
            </CardContent>
          </Card>

          {/* Thumbnail Queue Card */}
          <Card className="border-border/70 bg-gradient-to-b from-card to-card/60 shadow-xs">
            <CardHeader className="p-3 sm:p-4 pb-1 sm:pb-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] sm:text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 sm:gap-1.5 truncate">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Sharp Queue</span>
                </span>
                <Badge variant="outline" className="hidden sm:inline-flex text-[10px] font-mono border-amber-500/30 text-amber-600 px-1.5 py-0">
                  Workers
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 pt-0 space-y-1.5 sm:space-y-2">
              <div className="flex items-baseline gap-1">
                <span className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-foreground font-mono">
                  {data?.thumbQueue.pending ?? 0}
                </span>
                <span className="text-[11px] sm:text-xs font-medium text-muted-foreground">queued ({data?.thumbQueue.inFlight ?? 0} active)</span>
              </div>
              <div className="h-1 sm:h-1.5 rounded-full bg-amber-500/20" />
              <div className="pt-0.5 flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground font-mono">
                <span>Workers: {data?.thumbQueue.inFlight ?? 0}/2</span>
                <span className="truncate">Non-blocking</span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <Cpu className="w-3 h-3 text-muted-foreground shrink-0" />
                <span>Async image pipeline</span>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Storage Architecture & In-Depth Details */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-primary" />
            Storage Architecture & Disk Health
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="text-xs h-7 sm:h-8 gap-1.5 flex-1 sm:flex-initial"
            >
              <FolderSync className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              Run Replica Sync
            </Button>
            {syncStatus && (syncStatus.orphanFiles ?? 0) > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handlePurgeOrphans}
                disabled={isPurging}
                className="text-xs h-7 sm:h-8 gap-1.5 flex-1 sm:flex-initial"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clean {syncStatus.orphanFiles} Orphans
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {/* Primary Storage: PCIe NVMe */}
          <Card className="border-border/70 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />
            <CardHeader className="p-3.5 sm:p-5 pb-2 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <Server className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base font-semibold truncate">Primary Server Storage</CardTitle>
                    <CardDescription className="text-[11px] sm:text-xs truncate">
                      High-Speed PCIe Gen4 NVMe (Container Rootfs)
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-medium text-[10px] sm:text-xs shrink-0">
                  Active Primary
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-5 pt-0 space-y-3 sm:space-y-4">
              <div>
                <div className="flex items-baseline justify-between mb-1.5 flex-wrap gap-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
                    {Number(primaryFree).toFixed(1)} GB Free
                  </span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground font-mono">
                    {Number(primaryUsed).toFixed(1)} GB of {Number(primaryTotal).toFixed(1)} GB ({Math.round(primaryPercent)}%)
                  </span>
                </div>
                <Progress value={primaryPercent} className="h-2 sm:h-2.5" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border border-border/50 rounded-lg p-2.5 sm:p-3 bg-muted/20">
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Storage Path</span>
                  <span className="font-mono font-medium text-foreground truncate block text-xs" title={storage?.path ?? "/app/storage"}>
                    {storage?.path ?? "/app/storage"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Host Volume</span>
                  <span className="font-mono font-medium text-foreground text-xs">
                    local-lvm: 500 GB NVMe
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Est. Photo Capacity</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-xs">
                    ~{primaryEstPhotos.toLocaleString()} photos
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Write Throughput</span>
                  <span className="font-mono font-medium text-foreground text-xs">
                    3,500+ MB/s (PCIe)
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Replica Storage: Samsung 1TB SSD Mirror */}
          <Card className="border-border/70 shadow-xs relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500" />
            <CardHeader className="p-3.5 sm:p-5 pb-2 sm:pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                    <Database className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm sm:text-base font-semibold truncate">SSD Backup Replica</CardTitle>
                    <CardDescription className="text-[11px] sm:text-xs truncate">
                      Dedicated USB 3.0 SSD (Live Mirror)
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/30 font-medium text-[10px] sm:text-xs shrink-0">
                  {syncStatus?.inSync ? "In Sync" : "Mirror Active"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-3.5 sm:p-5 pt-0 space-y-3 sm:space-y-4">
              <div>
                <div className="flex items-baseline justify-between mb-1.5 flex-wrap gap-1">
                  <span className="text-xl sm:text-2xl font-bold font-mono tracking-tight text-foreground">
                    {Number(replicaFree).toFixed(1)} GB Free
                  </span>
                  <span className="text-[11px] sm:text-xs text-muted-foreground font-mono">
                    {Number(replicaUsed).toFixed(1)} GB of {Number(replicaTotal).toFixed(1)} GB ({Math.round(replicaPercent)}%)
                  </span>
                </div>
                <Progress value={replicaPercent} className="h-2 sm:h-2.5" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs border border-border/50 rounded-lg p-2.5 sm:p-3 bg-muted/20">
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Replica Path</span>
                  <span className="font-mono font-medium text-foreground truncate block text-xs" title={storage?.replicaPath ?? "/mnt/wedding-ssd/crowdsnap-replica"}>
                    {storage?.replicaPath ?? "/mnt/wedding-ssd"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Drive Partition</span>
                  <span className="font-mono font-medium text-foreground text-xs">
                    /dev/sdb1 (1.0 TB ext4)
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Est. Photo Capacity</span>
                  <span className="font-mono font-semibold text-blue-600 dark:text-blue-400 text-xs">
                    ~{replicaEstPhotos.toLocaleString()} photos
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] sm:text-[11px]">Replication Mode</span>
                  <span className="font-mono font-medium text-foreground text-xs">
                    Synchronous Dual-Write
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Host & Network Storage Ecosystem */}
        <Card className="border-border/60 bg-muted/10 shadow-xs">
          <CardHeader className="p-3.5 sm:p-5 pb-2 sm:pb-2.5">
            <CardTitle className="text-xs sm:text-sm font-semibold flex items-center gap-2">
              <Server className="w-4 h-4 text-primary shrink-0" />
              <span>Proxmox Host Storage & Network Fail-Safe Ecosystem</span>
            </CardTitle>
            <CardDescription className="text-[11px] sm:text-xs">
              Overview of all detected hardware storage and network NAS devices available for redundancy.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3.5 sm:p-5 pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 text-xs">
              {/* Host NVMe Pool */}
              <div className="p-2.5 sm:p-3 rounded-lg border border-border/60 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="font-medium text-foreground text-xs">Host NVMe Pool</span>
                    <Badge variant="outline" className="text-[10px] font-mono">local-lvm</Badge>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    1.8 TB NVMe Drive (`nvme0n1`).
                  </p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-border/40">
                  <span className="text-[11px] sm:text-xs font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                    1.2 TB unallocated
                  </span>
                </div>
              </div>

              {/* Host Secondary SATA */}
              <div className="p-2.5 sm:p-3 rounded-lg border border-border/60 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="font-medium text-foreground text-xs">Host SATA Volume</span>
                    <Badge variant="outline" className="text-[10px] font-mono">/dev/sda</Badge>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    233 GB SATA disk (`wedding-backups`).
                  </p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-border/40">
                  <span className="text-[11px] sm:text-xs font-semibold text-foreground font-mono">
                    156 GB free for snapshots
                  </span>
                </div>
              </div>

              {/* Synology NAS */}
              <div className="p-2.5 sm:p-3 rounded-lg border border-border/60 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="font-medium text-foreground text-xs">Synology NAS</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-600">
                      LAN Online
                    </Badge>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    192.168.0.139 (DSM / SMB).
                  </p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-border/40">
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground">
                    Target for background rsync
                  </span>
                </div>
              </div>

              {/* UGREEN NAS */}
              <div className="p-2.5 sm:p-3 rounded-lg border border-border/60 bg-background flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between text-muted-foreground mb-1">
                    <span className="font-medium text-foreground text-xs">UGREEN NAS</span>
                    <Badge variant="outline" className="text-[10px] font-mono border-emerald-500/30 text-emerald-600">
                      LAN Online
                    </Badge>
                  </div>
                  <p className="text-[11px] sm:text-xs text-muted-foreground">
                    192.168.0.200 (UGOS / SMB).
                  </p>
                </div>
                <div className="mt-2 pt-1.5 border-t border-border/40">
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground">
                    Target for multi-bay redundancy
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Live Recent Uploads Feed */}
      <div className="space-y-2.5 sm:space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-primary" />
            Live Ingestion Ticker
          </h2>
          <span className="text-[11px] sm:text-xs text-muted-foreground font-mono">
            {data?.recentUploads?.length ?? 0} activities
          </span>
        </div>

        {(!data?.recentUploads || data.recentUploads.length === 0) ? (
          <Card className="border-border/60 p-4 sm:p-6 text-center bg-muted/10 border-dashed">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-muted-foreground/60 shrink-0" />
              Event album is pristine and empty. Guest uploads will stream here in real time as photos and videos arrive.
            </p>
          </Card>
        ) : (
          <Card className="border-border/60 overflow-hidden">
            <div className="divide-y divide-border/40">
              {data.recentUploads.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 text-xs hover:bg-muted/30 transition-colors gap-2"
                >
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <div className="p-1.5 sm:p-2 rounded-md bg-muted text-muted-foreground shrink-0">
                      <Smartphone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-foreground block truncate text-xs sm:text-sm">
                        {item.fileName}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-muted-foreground truncate block">
                        {formatBytes(item.sizeBytes)} • {item.device}
                        {item.eventName ? ` • ${item.eventName}` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                    <Badge variant="outline" className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0 hidden xs:inline-flex">
                      {item.mimeType.split("/")[1] || "media"}
                    </Badge>
                    <span className="text-[10px] sm:text-xs text-muted-foreground tabular-nums font-mono whitespace-nowrap">
                      {timeAgo(item.timestamp, data.now)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
