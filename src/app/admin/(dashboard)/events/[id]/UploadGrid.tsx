"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  Trash2, Download, Image as ImageIcon, Film, X,
  ChevronLeft, ChevronRight, Wifi, AlertTriangle,
  LayoutGrid, List, Users, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "@/components/TranslationProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDistanceToNow, format } from "date-fns";

const POLL_INTERVAL = 8_000;

interface Upload {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  deviceId?: string | null;
}

export default function UploadGrid({
  uploads: initialUploads,
  eventId,
  maxFileSizeMB,
}: {
  uploads: Upload[];
  eventId: string;
  maxFileSizeMB: number;
}) {
  const [uploads, setUploads] = useState(initialUploads);
  const [newCount, setNewCount] = useState(0);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState("newest");
  const [filterType, setFilterType] = useState("all");
  const [deviceFilter, setDeviceFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isLive, setIsLive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleteAllPassword, setDeleteAllPassword] = useState("");
  const [deleteAllPasswordError, setDeleteAllPasswordError] = useState(false);
  const [deleteAllStep, setDeleteAllStep] = useState(1);
  const { t } = useTranslation();

  const itemsPerPage = viewMode === "list" ? 50 : 20;

  const lastCheckedAt = useRef<string>(
    initialUploads.length > 0
      ? new Date(Math.max(...initialUploads.map(u => new Date(u.createdAt).getTime()))).toISOString()
      : new Date().toISOString()
  );
  // Tracks IDs we've already seen — used for deduplication outside of state updaters
  // so StrictMode double-invocation of updater functions doesn't double the count.
  const seenIds = useRef<Set<string>>(new Set(initialUploads.map(u => u.id)));
  // Every 5th poll is a full reconciliation to catch guest-side deletions.
  const pollCount = useRef(0);

  // Build a stable device → display-number map
  const uniqueDevices = useMemo(() => {
    const seen = new Map<string, number>();
    uploads.forEach(u => {
      if (u.deviceId && !seen.has(u.deviceId)) seen.set(u.deviceId, seen.size + 1);
    });
    return seen;
  }, [uploads]);

  const stats = useMemo(() => {
    const sorted = [...uploads].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return {
      count: uploads.length,
      imageCount: uploads.filter(u => u.mimeType.startsWith("image/")).length,
      videoCount: uploads.filter(u => u.mimeType.startsWith("video/")).length,
      totalSizeMB: uploads.reduce((acc, u) => acc + u.size, 0) / (1024 * 1024),
      uniqueDeviceCount: uniqueDevices.size,
      lastUpload: sorted.length > 0 ? new Date(sorted[0].createdAt) : null,
    };
  }, [uploads, uniqueDevices]);

  // Polling
  const poll = useCallback(async () => {
    try {
      pollCount.current++;
      const isReconciliation = pollCount.current % 5 === 0;

      const url = isReconciliation
        ? `/api/admin/events/${eventId}/uploads`
        : `/api/admin/events/${eventId}/uploads?since=${encodeURIComponent(lastCheckedAt.current)}`;

      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const incoming: Upload[] = data.uploads ?? [];

      if (isReconciliation) {
        // Replace client state with server truth — catches guest-side deletions.
        const serverIds = new Set(incoming.map(u => u.id));
        seenIds.current = serverIds;
        if (incoming.length > 0) {
          lastCheckedAt.current = new Date(
            Math.max(...incoming.map(u => new Date(u.createdAt).getTime()))
          ).toISOString();
        }
        setUploads(incoming);
        // Remove any "new" badges for items that no longer exist on the server.
        setNewIds(prev => { const next = new Set([...prev].filter(id => serverIds.has(id))); return next; });
        setNewCount(prev => { void prev; return 0; }); // clear stale banner after reconciliation
        return;
      }

      if (incoming.length === 0) return;

      lastCheckedAt.current = new Date(
        Math.max(...incoming.map((u: Upload) => new Date(u.createdAt).getTime()))
      ).toISOString();

      // Deduplicate against the ref (not state) so StrictMode double-invocation
      // of state updaters doesn't double-increment newCount.
      const truly_new = incoming.filter(u => !seenIds.current.has(u.id));
      if (truly_new.length === 0) return;
      truly_new.forEach(u => seenIds.current.add(u.id));

      setUploads(prev => [...truly_new, ...prev]);
      setNewCount(c => c + truly_new.length);
      setNewIds(prev => new Set([...prev, ...truly_new.map(u => u.id)]));
    } catch {
      // silently ignore
    }
  }, [eventId]);

  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [isLive, poll]);

  const filteredAndSortedUploads = useMemo(() => {
    let result = [...uploads];

    result.sort((a, b) => {
      if (sortOrder === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortOrder === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortOrder === "largest") return b.size - a.size;
      return a.size - b.size;
    });

    if (filterType === "images") result = result.filter(u => u.mimeType.startsWith("image/"));
    else if (filterType === "videos") result = result.filter(u => u.mimeType.startsWith("video/"));

    if (deviceFilter !== "all") result = result.filter(u => u.deviceId === deviceFilter);

    return result;
  }, [uploads, sortOrder, filterType, deviceFilter]);

  const totalPages = Math.ceil(filteredAndSortedUploads.length / itemsPerPage);
  const paginatedUploads = filteredAndSortedUploads.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => { setCurrentPage(1); }, [sortOrder, filterType, deviceFilter, viewMode]);

  const selectedImage = selectedIndex !== null ? filteredAndSortedUploads[selectedIndex] : null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (selectedIndex === null) return;
      if (e.key === "ArrowLeft") setSelectedIndex(i => (i! === 0 ? filteredAndSortedUploads.length - 1 : i! - 1));
      else if (e.key === "ArrowRight") setSelectedIndex(i => (i! === filteredAndSortedUploads.length - 1 ? 0 : i! + 1));
      else if (e.key === "Escape") setSelectedIndex(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, filteredAndSortedUploads.length]);

  useEffect(() => {
    if (selectedIndex !== null) {
      setTimeout(() => {
        document.getElementById(`thumb-${selectedIndex}`)?.scrollIntoView({
          behavior: "smooth", block: "nearest", inline: "center",
        });
      }, 10);
    }
  }, [selectedIndex]);

  const handleDelete = async (id: string) => {
    setDeleteTarget(null);
    try {
      const res = await fetch(`/api/admin/uploads/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setUploads(prev => prev.filter(u => u.id !== id));
      setNewIds(prev => { const next = new Set(prev); next.delete(id); return next; });
      toast.success(t("uploadGrid.fileDeleted"));
    } catch {
      toast.error(t("uploadGrid.failedDelete"));
    }
  };

  const handleDeleteAll = async () => {
    setDeleteAllPasswordError(false);
    setIsDeletingAll(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}/uploads`, {
        method: "DELETE",
        headers: { "x-confirm-password": deleteAllPassword },
      });
      if (res.status === 403) { setDeleteAllPasswordError(true); setIsDeletingAll(false); return; }
      if (!res.ok) throw new Error();
      setUploads([]);
      setConfirmDeleteAll(false);
      toast.success(t("uploadGrid.allUploadsDeleted"));
      window.location.reload();
    } catch {
      toast.error(t("uploadGrid.failedDeleteAll"));
      setIsDeletingAll(false);
    }
  };

  const openDeleteAllModal = () => {
    setDeleteAllPassword(""); setDeleteAllPasswordError(false); setDeleteAllStep(1); setConfirmDeleteAll(true);
  };

  const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const deviceLabel = (deviceId: string | null | undefined) => {
    if (!deviceId) return "Unknown";
    const num = uniqueDevices.get(deviceId);
    return `Device ${num ?? "?"}`;
  };

  if (uploads.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10">
        <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium">{t("uploadGrid.noUploads")}</h3>
        <p className="text-muted-foreground mt-1 max-w-sm mx-auto">{t("uploadGrid.noUploadsDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> {t("admin.uploads")}
          </p>
          <p className="text-lg font-bold">{stats.count}</p>
          <p className="text-[10px] text-muted-foreground">{stats.imageCount} img · {stats.videoCount} vid</p>
          <p className="text-[10px] text-muted-foreground/60">{initialUploads.length} in DB at load</p>
        </div>

        <div className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-0.5">Storage</p>
          <p className="text-lg font-bold">{stats.totalSizeMB.toFixed(1)}</p>
          <p className="text-[10px] text-muted-foreground">MB total</p>
          {stats.count > 0 && (
            <p className="text-[10px] text-muted-foreground/60">~{(stats.totalSizeMB / stats.count).toFixed(1)} MB avg</p>
          )}
        </div>

        <div className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <Users className="w-3 h-3" /> Contributors
          </p>
          <p className="text-lg font-bold">{stats.uniqueDeviceCount || "—"}</p>
          <p className="text-[10px] text-muted-foreground">unique devices</p>
          <p className="text-[10px] text-muted-foreground/60">max {maxFileSizeMB} MB/file</p>
        </div>

        <div className="bg-muted/30 border border-border/40 rounded-lg px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Last Upload
          </p>
          <p className="text-sm font-bold leading-snug">
            {stats.lastUpload ? formatDistanceToNow(stats.lastUpload, { addSuffix: true }) : "—"}
          </p>
          {stats.lastUpload && (
            <p className="text-[10px] text-muted-foreground/60">{format(stats.lastUpload, "MMM d, h:mm a")}</p>
          )}
        </div>
      </div>

      {/* ── Toolbar ───────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {newCount > 0 && (
            <motion.button
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              onClick={() => { setCurrentPage(1); setSortOrder("newest"); setNewCount(0); setNewIds(new Set()); }}
              className="w-full py-2 px-4 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/15 transition-colors"
            >
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {newCount} new {newCount === 1 ? "upload" : "uploads"} — click to view
            </motion.button>
          )}
        </AnimatePresence>

        <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-muted/20 p-2 rounded-lg border border-border/50">
          {/* Left: type + device filters */}
          <div className="flex gap-1.5 w-full sm:w-auto flex-wrap items-center">
            <Button variant={filterType === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterType("all")} className="rounded-full flex-shrink-0 h-7 text-xs px-3">
              {t("uploadGrid.all")}
            </Button>
            <Button variant={filterType === "images" ? "default" : "outline"} size="sm" onClick={() => setFilterType("images")} className="rounded-full flex-shrink-0 h-7 text-xs px-3">
              <ImageIcon className="w-3 h-3 mr-1.5" /> {t("uploadGrid.images")}
            </Button>
            <Button variant={filterType === "videos" ? "default" : "outline"} size="sm" onClick={() => setFilterType("videos")} className="rounded-full flex-shrink-0 h-7 text-xs px-3">
              <Film className="w-3 h-3 mr-1.5" /> {t("uploadGrid.videos")}
            </Button>

            {uniqueDevices.size > 0 && (
              <>
                <span className="w-px h-4 bg-border shrink-0" />
                {Array.from(uniqueDevices.entries()).map(([id, num]) => (
                  <Button
                    key={id}
                    variant={deviceFilter === id ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setDeviceFilter(deviceFilter === id ? "all" : id)}
                    className="rounded-full flex-shrink-0 h-7 text-xs px-3"
                    title={id}
                  >
                    <Users className="w-3 h-3 mr-1.5" /> Device {num}
                  </Button>
                ))}
              </>
            )}

            <span className="w-px h-4 bg-border shrink-0" />
            <Button variant="destructive" size="sm" onClick={openDeleteAllModal} disabled={isDeletingAll} className="rounded-full flex-shrink-0 h-7 text-xs px-3">
              <Trash2 className="w-3 h-3 mr-1.5" /> {isDeletingAll ? t("uploadGrid.deleting") : t("uploadGrid.deleteAll")}
            </Button>
          </div>

          {/* Right: live + view toggle + sort */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              onClick={() => setIsLive(l => !l)}
              title={isLive ? "Live on — click to pause" : "Paused — click to resume"}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors flex-shrink-0 ${
                isLive
                  ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800 dark:text-green-400"
                  : "bg-muted border-border text-muted-foreground"
              }`}
            >
              <Wifi className="w-3 h-3" />
              {isLive && (
                <span className="relative inline-flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                </span>
              )}
              {isLive ? "Live" : "Paused"}
            </button>

            <div className="flex border border-border rounded-md overflow-hidden shrink-0">
              <button
                onClick={() => setViewMode("grid")}
                title="Grid view"
                className={`px-2 py-1.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                title="List view"
                className={`px-2 py-1.5 border-l border-border transition-colors ${viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>

            <select
              className="text-sm bg-background border border-border rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary w-full sm:w-auto"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
            >
              <option value="newest">{t("uploadGrid.newestFirst")}</option>
              <option value="oldest">{t("uploadGrid.oldestFirst")}</option>
              <option value="largest">{t("uploadGrid.largestFirst")}</option>
              <option value="smallest">{t("uploadGrid.smallestFirst")}</option>
            </select>
          </div>
        </div>

        {/* Active filter summary */}
        {(deviceFilter !== "all" || filterType !== "all") && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span>Showing {filteredAndSortedUploads.length} of {uploads.length} uploads</span>
            {deviceFilter !== "all" && (
              <button
                onClick={() => setDeviceFilter("all")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                Device {uniqueDevices.get(deviceFilter)} <X className="w-3 h-3 ml-0.5" />
              </button>
            )}
            {filterType !== "all" && (
              <button
                onClick={() => setFilterType("all")}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80"
              >
                {filterType} <X className="w-3 h-3 ml-0.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Content ───────────────────────────────────── */}
      {paginatedUploads.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-xl bg-muted/10">
          <h3 className="text-lg font-medium">{t("uploadGrid.noResults")}</h3>
          <p className="text-muted-foreground mt-1 text-sm">{t("uploadGrid.tryChangingFilters")}</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10 gap-3">
          {paginatedUploads.map(upload => {
            const globalIndex = filteredAndSortedUploads.findIndex(u => u.id === upload.id);
            const isNew = newIds.has(upload.id);
            const isImage = upload.mimeType.startsWith("image/");
            return (
              <motion.div
                key={upload.id}
                layout
                initial={isNew ? { opacity: 0, scale: 0.85 } : false}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <div
                  className={`group relative rounded-lg overflow-hidden cursor-pointer border transition-all ${
                    isNew ? "border-green-400 ring-2 ring-green-400/30" : "border-border/40 hover:border-border/80"
                  }`}
                  onClick={() => setSelectedIndex(globalIndex)}
                >
                  {/* Thumbnail */}
                  <div className="aspect-square relative bg-muted">
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/p/${eventId}/thumb/${upload.id}`} alt={upload.originalName} loading="lazy" className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <Film className="w-6 h-6 text-muted-foreground/50" />
                      </div>
                    )}
                    {isNew && (
                      <span className="absolute top-1 left-1 text-[9px] font-bold uppercase tracking-wide bg-green-500 text-white px-1.5 py-0.5 rounded-full">New</span>
                    )}
                    {/* Action buttons — appear on hover */}
                    <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                      <Button size="icon" variant="secondary" className="h-6 w-6 rounded-full shadow-md" asChild>
                        <a href={`/api/admin/uploads/${upload.id}`} download={upload.originalName} target="_blank">
                          <Download className="w-3 h-3" />
                        </a>
                      </Button>
                      <Button size="icon" variant="destructive" className="h-6 w-6 rounded-full shadow-md"
                        onClick={() => setDeleteTarget({ id: upload.id, name: upload.originalName })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Info strip below image */}
                  <div className="px-2 py-1.5 bg-background border-t border-border/30">
                    <p className="text-[11px] font-medium truncate leading-tight" title={upload.originalName}>{upload.originalName}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatSize(upload.size)} · {deviceLabel(upload.deviceId)}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <div className="rounded-lg border border-border/50 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border/50">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground w-12">Preview</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Type</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden sm:table-cell">Size</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground hidden md:table-cell">Device</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground">Uploaded</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {paginatedUploads.map(upload => {
                const globalIndex = filteredAndSortedUploads.findIndex(u => u.id === upload.id);
                const isNew = newIds.has(upload.id);
                const isImage = upload.mimeType.startsWith("image/");
                return (
                  <tr
                    key={upload.id}
                    className={`group hover:bg-muted/20 transition-colors ${isNew ? "bg-green-50/30 dark:bg-green-950/10" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <div
                        className="w-10 h-10 rounded overflow-hidden bg-muted cursor-pointer border border-border/30 shrink-0 flex items-center justify-center"
                        onClick={() => setSelectedIndex(globalIndex)}
                      >
                        {isImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/p/${eventId}/thumb/${upload.id}`} alt={upload.originalName} loading="lazy" className="object-cover w-full h-full" />
                        ) : (
                          <Film className="w-4 h-4 text-muted-foreground/50" />
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        className="text-left font-medium truncate max-w-[140px] sm:max-w-[220px] hover:text-primary transition-colors block"
                        onClick={() => setSelectedIndex(globalIndex)}
                        title={upload.originalName}
                      >
                        {upload.originalName}
                      </button>
                      {isNew && <span className="text-[10px] text-green-600 font-medium">New</span>}
                    </td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      <Badge variant="outline" className={`text-[10px] ${isImage ? "border-blue-200 text-blue-600" : "border-purple-200 text-purple-600"}`}>
                        {isImage ? "Image" : "Video"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs hidden sm:table-cell whitespace-nowrap">
                      {formatSize(upload.size)}
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell">
                      <button
                        className="text-[11px] text-muted-foreground hover:text-foreground transition-colors font-mono px-1.5 py-0.5 rounded bg-muted/50 border border-border/30"
                        onClick={() => setDeviceFilter(upload.deviceId || "all")}
                        title={upload.deviceId || "Unknown device"}
                      >
                        {deviceLabel(upload.deviceId)}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap" title={format(new Date(upload.createdAt), "PPpp")}>
                      <span className="text-xs">{formatDistanceToNow(new Date(upload.createdAt), { addSuffix: true })}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7 rounded opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                          <a href={`/api/admin/uploads/${upload.id}`} download={upload.originalName} target="_blank">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 rounded text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => setDeleteTarget({ id: upload.id, name: upload.originalName })}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination ────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-8">
          <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            {t("uploadGrid.page")} {currentPage} {t("uploadGrid.of")} {totalPages}
          </span>
          <Button variant="outline" size="icon" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────── */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title={t("uploadGrid.confirmDelete", { name: deleteTarget?.name ?? "" })}
        confirmLabel={t("uploadGrid.delete")}
        cancelLabel={t("createEvent.cancel")}
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget.id); }}
      />

      <ConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={open => { if (!open && !isDeletingAll) setConfirmDeleteAll(false); }}
        title={t("uploadGrid.deleteAll")}
        confirmLabel={deleteAllStep < 3 ? "Next →" : t("uploadGrid.deleteAll")}
        cancelLabel={t("createEvent.cancel")}
        isLoading={isDeletingAll}
        onConfirm={() => {
          if (deleteAllStep < 3) setDeleteAllStep(s => s + 1);
          else handleDeleteAll();
        }}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {[1, 2, 3].map(s => (
              <span key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= deleteAllStep ? "bg-destructive" : "bg-muted"}`} />
            ))}
            <span className="ml-1 text-muted-foreground/70">Step {deleteAllStep} of 3</span>
          </div>
          {deleteAllStep === 1 && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("uploadGrid.confirmDeleteAll1", { count: uploads.length })}</span>
            </div>
          )}
          {deleteAllStep === 2 && (
            <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t("uploadGrid.confirmDeleteAll2", { count: uploads.length })}</span>
            </div>
          )}
          {deleteAllStep === 3 && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/15 p-3 text-sm text-destructive font-semibold">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t("uploadGrid.confirmDeleteAll3")}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Enter admin password to confirm</label>
                <input
                  type="password"
                  value={deleteAllPassword}
                  onChange={e => { setDeleteAllPassword(e.target.value); setDeleteAllPasswordError(false); }}
                  placeholder="Admin password"
                  className={`w-full rounded-md border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-destructive/50 ${deleteAllPasswordError ? "border-destructive" : "border-border"}`}
                  onKeyDown={e => { if (e.key === "Enter") handleDeleteAll(); }}
                  autoFocus
                />
                {deleteAllPasswordError && <p className="text-xs text-destructive">Incorrect password.</p>}
              </div>
            </div>
          )}
        </div>
      </ConfirmDialog>

      {/* ── Lightbox ──────────────────────────────────── */}
      <AnimatePresence>
        {selectedImage && selectedIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 md:p-8"
            onClick={() => setSelectedIndex(null)}
          >
            <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full z-[60]" onClick={() => setSelectedIndex(null)}>
              <X className="w-6 h-6" />
            </Button>

            {filteredAndSortedUploads.length > 1 && (
              <>
                <Button variant="ghost" size="icon"
                  className="absolute left-2 md:left-8 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full z-[60] h-10 w-10 md:h-14 md:w-14"
                  onClick={e => { e.stopPropagation(); setSelectedIndex(i => (i! === 0 ? filteredAndSortedUploads.length - 1 : i! - 1)); }}>
                  <ChevronLeft className="w-8 h-8 md:w-12 md:h-12" />
                </Button>
                <Button variant="ghost" size="icon"
                  className="absolute right-2 md:right-8 top-1/2 -translate-y-1/2 text-white hover:bg-white/20 rounded-full z-[60] h-10 w-10 md:h-14 md:w-14"
                  onClick={e => { e.stopPropagation(); setSelectedIndex(i => (i! === filteredAndSortedUploads.length - 1 ? 0 : i! + 1)); }}>
                  <ChevronRight className="w-8 h-8 md:w-12 md:h-12" />
                </Button>
              </>
            )}

            <motion.div
              key={selectedImage.id}
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="relative max-w-full max-h-full flex flex-col items-center justify-center outline-none pb-28"
              onClick={e => e.stopPropagation()}
            >
              {selectedImage.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/uploads/${selectedImage.id}`} alt={selectedImage.originalName} className="max-w-full max-h-[70vh] object-contain rounded-md shadow-2xl bg-black" />
              ) : (
                <video src={`/api/admin/uploads/${selectedImage.id}`} className="max-w-full max-h-[70vh] rounded-md shadow-2xl bg-black outline-none" controls playsInline autoPlay />
              )}
              <div className="mt-4 text-center text-white/90">
                <p className="font-medium text-lg drop-shadow-md">{selectedImage.originalName}</p>
                <p className="text-sm text-white/70 drop-shadow-md">
                  {formatSize(selectedImage.size)} · {deviceLabel(selectedImage.deviceId)} · {format(new Date(selectedImage.createdAt), "MMM d, yyyy h:mm a")}
                </p>
              </div>
            </motion.div>

            {/* Thumbnail strip */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center w-full z-50 pointer-events-auto" onClick={e => e.stopPropagation()}>
              <div className="flex gap-2 md:gap-3 px-4 overflow-x-auto pb-4 max-w-[90vw] snap-x scroll-smooth" style={{ scrollbarWidth: "none" }}>
                {filteredAndSortedUploads.map((u, i) => (
                  <button
                    id={`thumb-${i}`}
                    key={u.id}
                    onClick={() => setSelectedIndex(i)}
                    className={`relative h-16 w-16 md:h-20 md:w-20 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all transform snap-center ${
                      i === selectedIndex
                        ? "border-white ring-2 ring-white/20 ring-offset-2 ring-offset-black scale-110 opacity-100 z-10"
                        : "border-transparent opacity-40 hover:opacity-100 hover:scale-105"
                    }`}
                  >
                    {u.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/admin/uploads/${u.id}`} alt={u.originalName} loading="lazy" className="object-cover w-full h-full" />
                    ) : (
                      <video src={`/api/admin/uploads/${u.id}#t=0.001`} className="object-cover w-full h-full" preload="metadata" muted playsInline />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
