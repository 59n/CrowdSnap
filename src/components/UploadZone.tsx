"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, X, Image as ImageIcon, Film, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { toast } from "sonner";
import { useTranslation } from "./TranslationProvider";
import { isLikelyGuestMediaFile } from "@/lib/guest-media";
import { uploadLooksSlow } from "@/lib/upload-pace";
import { shrinkGuestPhoto } from "@/lib/guest-photo";
import { UPLOAD_CHUNK_BYTES } from "@/lib/upload-chunk-order";

interface UploadZoneProps {
  eventId: string;
}

function PreviewImage({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return <ImageIcon className="w-5 h-5 text-muted-foreground" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="preview" className="w-full h-full object-cover rounded-md" />;
}

/** Keep retrying 429 until window resets — not a tiny fixed attempt count */
const MAX_429_RETRIES = 12;
const DEFAULT_RETRY_MS = 8_000;
const MAX_RETRY_MS = 90_000;
const CONCURRENCY = 3;

function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("crowdsnap_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("crowdsnap_device_id", id);
  }
  return id;
}

function clientLog(event: string, fields: Record<string, string | number | boolean | null>) {
  fetch("/api/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event, ...fields }),
    keepalive: true,
  }).catch(() => {});
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function retryAfterMs(xhr: XMLHttpRequest): number {
  const h = xhr.getResponseHeader("Retry-After");
  if (h) {
    const sec = parseInt(h, 10);
    if (Number.isFinite(sec) && sec > 0) {
      return Math.min(Math.max(sec, 1) * 1000, MAX_RETRY_MS);
    }
  }
  return DEFAULT_RETRY_MS;
}

type UploadAttempt =
  | { ok: true; uploads?: unknown[] }
  | { ok: false; status: number; error?: string; retryAfterMs?: number };

function postSlice(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onSlow: () => void,
  onBytes: (loaded: number) => void,
  started: number,
  loadedBefore: number,
  total: number
): Promise<UploadAttempt> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.timeout = 120_000;
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      const loaded = loadedBefore + event.loaded;
      onBytes(loaded);
      if (uploadLooksSlow(loaded, Date.now() - started, total)) {
        onSlow();
      }
    };
    xhr.onload = () => {
      let payload: { error?: string; uploads?: unknown[] } = {};
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ ok: true, uploads: payload.uploads });
        return;
      }
      if (xhr.status === 429) {
        resolve({
          ok: false,
          status: 429,
          error: payload.error,
          retryAfterMs: retryAfterMs(xhr),
        });
        return;
      }
      resolve({ ok: false, status: xhr.status, error: payload.error });
    };
    xhr.onerror = () => resolve({ ok: false, status: 0, error: "network" });
    xhr.ontimeout = () => resolve({ ok: false, status: 0, error: "network" });
    xhr.send(body);
  });
}

async function uploadChunked(
  eventId: string,
  file: File,
  deviceId: string,
  onProgress: (pct: number) => void,
  onSlow: () => void
): Promise<UploadAttempt> {
  const uploadId = crypto.randomUUID();
  const count = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
  const started = Date.now();
  let last: UploadAttempt = { ok: false, status: 0, error: "network" };
  clientLog("upload.start", {
    name: file.name,
    size: file.size,
    chunks: count,
    type: file.type || "unknown",
  });

  for (let index = 0; index < count; index++) {
    const slice = file.slice(
      index * UPLOAD_CHUNK_BYTES,
      Math.min(file.size, (index + 1) * UPLOAD_CHUNK_BYTES)
    );
    let attempt = 0;
    let done = false;
    while (attempt < 4 && !done) {
      last = await postSlice(
        `/api/upload/${eventId}`,
        slice,
        {
          "content-type": "application/octet-stream",
          "x-device-id": deviceId,
          "x-upload-id": uploadId,
          "x-chunk-index": String(index),
          "x-chunk-count": String(count),
          "x-file-size": String(file.size),
          "x-file-name": file.name,
          "x-file-type": file.type || "application/octet-stream",
        },
        onSlow,
        (loaded) => onProgress(Math.min(100, (loaded / file.size) * 100)),
        started,
        index * UPLOAD_CHUNK_BYTES,
        file.size
      );
      if (last.ok) {
        onProgress(((index + 1) / count) * 100);
        done = true;
        break;
      }
      if (last.status === 429) return last;
      attempt++;
      await sleep(1000 * attempt);
    }
    if (!done) {
      clientLog("upload.chunk_failed", {
        name: file.name,
        size: file.size,
        index,
        status: "status" in last ? last.status : 0,
        error: "error" in last ? last.error || "" : "",
      });
      return last;
    }
  }
  return last;
}

function uploadOnce(
  eventId: string,
  file: File,
  deviceId: string,
  onProgress: (pct: number) => void,
  onSlow: () => void
): Promise<UploadAttempt> {
  if (file.size > UPLOAD_CHUNK_BYTES) {
    return uploadChunked(eventId, file, deviceId, onProgress, onSlow);
  }
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload/${eventId}`, true);
    xhr.setRequestHeader("x-device-id", deviceId);
    const started = Date.now();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
        if (uploadLooksSlow(event.loaded, Date.now() - started, event.total)) {
          onSlow();
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        let uploads: unknown[] | undefined;
        try {
          const data = JSON.parse(xhr.responseText);
          uploads = data.uploads;
        } catch {
          /* ignore */
        }
        resolve({ ok: true, uploads });
        return;
      }

      let error: string | undefined;
      try {
        error = JSON.parse(xhr.responseText)?.error;
      } catch {
        /* ignore */
      }

      if (xhr.status === 429) {
        resolve({
          ok: false,
          status: 429,
          error,
          retryAfterMs: retryAfterMs(xhr),
        });
        return;
      }

      resolve({ ok: false, status: xhr.status, error });
    };

    xhr.onerror = () => {
      resolve({ ok: false, status: 0, error: "network" });
    };

    xhr.send(formData);
  });
}

export default function UploadZone({ eventId }: UploadZoneProps) {
  const { t } = useTranslation();
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [slowConnection, setSlowConnection] = useState(false);
  const [failedNotice, setFailedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!uploading) return;
    const id = window.setInterval(() => {
      clientLog("upload.heartbeat", {
        progress,
        files: files.length,
        names: files.map((f) => f.name).join(", ").slice(0, 200),
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [uploading, progress, files]);
  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    deviceIdRef.current = getOrCreateDeviceId();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFilesSelected = useCallback((newFiles: File[]) => {
    const valid = newFiles.filter((f) => isLikelyGuestMediaFile(f));
    const invalid = newFiles.filter((f) => !isLikelyGuestMediaFile(f));
    if (invalid.length) toast.error(t("guest.someSkipped"));
    setSkippedFiles((prev) => [...prev, ...invalid]);
    setFiles((prev) => [...prev, ...valid]);
  }, [t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    }
  }, [handleFilesSelected]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFilesSelected(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (!files.length) return;

    setUploading(true);
    setProgress(0);
    setStatusLine(null);
    setSlowConnection(false);
    setFailedNotice(null);

    const portions = new Array(files.length).fill(0);
    const queue: File[] = [];
    setStatusLine(t("guest.preparing"));
    for (const file of files) {
      try {
        queue.push(await shrinkGuestPhoto(file));
      } catch {
        queue.push(file);
      }
    }
    setStatusLine(null);
    let successCount = 0;
    let failCount = 0;
    let rateLimitedCount = 0;
    let networkFailCount = 0;
    const allUploadedItems: unknown[] = [];
    const failedFiles: File[] = [];

    let rateLimitToastShown = false;
    let lastRetrySeconds = 0;

    // Serialize index for progress across concurrent workers
    const total = queue.length;
    let completedSlots = 0;

    const bumpProgress = () => {
      completedSlots++;
      setProgress(Math.round((completedSlots / total) * 100));
    };

    // Global pause when rate-limited so workers don't all stampede
    let globalPause: Promise<void> | null = null;
    let globalPauseResolve: (() => void) | null = null;
    const RATE_LIMIT_TOAST_ID = "rate-limit-pause";

    const pauseEveryone = async (waitMs: number) => {
      if (globalPause) {
        await globalPause;
        return;
      }
      globalPause = new Promise<void>((r) => {
        globalPauseResolve = r;
      });

      const endsAt = Date.now() + waitMs;
      const remainingSec = () =>
        Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));

      const tick = () => {
        const seconds = Math.max(1, remainingSec());
        lastRetrySeconds = seconds;
        setStatusLine(t("guest.rateLimitedWaiting", { seconds }));
        // Same id updates the existing toast so the description counts down
        toast.warning(t("guest.rateLimitedTitle"), {
          id: RATE_LIMIT_TOAST_ID,
          description: t("guest.rateLimitedDesc", { seconds }),
          duration: Math.max(endsAt - Date.now() + 1500, 2000),
        });
        rateLimitToastShown = true;
      };

      tick();
      const interval = setInterval(tick, 250);

      try {
        await sleep(waitMs);
      } finally {
        clearInterval(interval);
        setStatusLine(null);
        toast.dismiss(RATE_LIMIT_TOAST_ID);
        globalPauseResolve?.();
        globalPause = null;
        globalPauseResolve = null;
      }
    };

    const uploadWithRetry = async (file: File, index: number): Promise<boolean> => {
      let attempt = 0;

      while (attempt <= MAX_429_RETRIES) {
        if (globalPause) await globalPause;

        const result = await uploadOnce(
          eventId,
          file,
          deviceIdRef.current,
          (filePct) => {
            portions[index] = filePct;
            const sum = portions.reduce((acc, n) => acc + n, 0);
            const overall = sum / portions.length;
            setProgress(overall > 0 && overall < 1 ? 1 : Math.min(99, Math.round(overall)));
          },
          () => setSlowConnection(true)
        );

        if (result.ok) {
          if (result.uploads) allUploadedItems.push(...result.uploads);
          return true;
        }

        if (result.status === 429 && attempt < MAX_429_RETRIES) {
          attempt++;
          rateLimitedCount++;
          const waitMs = result.retryAfterMs ?? DEFAULT_RETRY_MS;
          await pauseEveryone(waitMs);
          continue;
        }

        if (result.status === 429) {
          rateLimitedCount++;
          return false;
        }

        // Flaky venue Wi-Fi: retry a couple of times before giving up.
        if ((result.status === 0 || result.error === "network") && attempt < 2) {
          attempt++;
          await sleep(1500);
          continue;
        }

        if (result.error === "network") {
          networkFailCount++;
        } else if (result.error) {
          toast.error(result.error);
        } else {
          toast.error(`${t("guest.failedUpload")} ${file.name}`);
        }
        return false;
      }

      return false;
    };

    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const i = cursor++;
        const file = queue[i];
        const ok = await uploadWithRetry(file, i);
        if (ok) successCount++;
        else {
          failCount++;
          failedFiles.push(file);
        }
        bumpProgress();
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker())
    );

    setUploading(false);
    setProgress(100);
    setStatusLine(null);

    // Keep only failed files in the queue so the user can retry
    setFiles(failedFiles);
    clientLog(failCount > 0 ? "upload.finished_with_errors" : "upload.finished", {
      ok: successCount,
      failed: failCount,
      network: networkFailCount,
      rateLimited: rateLimitedCount,
    });
    if (failCount > 0) {
      setFailedNotice(
        networkFailCount > 0 && successCount === 0
          ? t("guest.failedConnection")
          : t("guest.failedSome", { count: failCount })
      );
    } else {
      setFailedNotice(null);
      setSlowConnection(false);
    }

    if (successCount > 0 && failCount === 0) {
      toast.success(`${t("guest.success")} ${successCount} ${t("guest.files")}`);
      setUploadComplete(true);
      window.dispatchEvent(
        new CustomEvent("crowdsnap:uploaded", { detail: allUploadedItems })
      );
    } else if (successCount > 0 && failCount > 0) {
      toast.warning(t("guest.partialUpload", { ok: successCount, fail: failCount }), {
        description:
          rateLimitedCount > 0
            ? t("guest.rateLimitedGiveUp", { seconds: lastRetrySeconds || 60 })
            : undefined,
        duration: 12_000,
      });
      window.dispatchEvent(
        new CustomEvent("crowdsnap:uploaded", { detail: allUploadedItems })
      );
    } else if (failCount > 0 && rateLimitToastShown) {
      toast.error(t("guest.rateLimitedGiveUp", { seconds: lastRetrySeconds || 60 }), {
        duration: 12_000,
      });
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto space-y-4">
      {!uploading && <motion.div
        animate={{ scale: isDragging ? 1.02 : 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`relative flex flex-col items-center justify-center w-full rounded-2xl border-2 border-dashed transition-all duration-200 overflow-hidden ${
          isDragging
            ? "border-primary bg-primary/8 shadow-lg shadow-primary/10"
            : "border-border/50 bg-card/60 hover:border-primary/40 hover:bg-card"
        }`}
        style={{ minHeight: "13rem" }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={uploading ? undefined : handleDrop}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 to-transparent pointer-events-none" />

        {uploadComplete ? (
          <div className="flex flex-col items-center justify-center py-10 px-6 z-10">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
            >
              <CheckCircle2 className="w-14 h-14 mb-3 text-green-500" />
            </motion.div>
            <p className="text-base font-semibold text-foreground">{t("guest.thankYou")}</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5 text-center">
              {t("guest.safelyShared")}
            </p>
            <Button variant="outline" size="sm" onClick={() => setUploadComplete(false)}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              {t("guest.uploadMore")}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center justify-center py-10 px-6 z-10 text-center">
              <div
                className={`p-4 rounded-full mb-4 transition-colors ${
                  isDragging ? "bg-primary/15" : "bg-muted/60"
                }`}
              >
                <UploadCloud
                  className={`w-9 h-9 transition-colors ${
                    isDragging ? "text-primary" : "text-muted-foreground/60"
                  }`}
                />
              </div>
              <p className="text-sm font-medium text-foreground/80">
                <span className="text-primary font-semibold">{t("guest.clickToUpload")}</span>{" "}
                {t("guest.orDragAndDrop")}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5">{t("guest.supportedFiles")}</p>
            </div>
            <input
              type="file"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              multiple
              onChange={handleFileInput}
              disabled={uploading}
              accept="image/*,video/*,.heic,.heif,.avif,.mov,.mp4,.m4v,.3gp,.webm"
            />
          </>
        )}
      </motion.div>}

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm"
          >
            <div className="px-4 py-3 border-b border-border/50 bg-muted/20 flex justify-between items-center">
              <span className="text-sm font-medium flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-primary" />
                {files.length}{" "}
                {files.length !== 1 ? t("guest.filesSelected") : t("guest.fileSelected")}
              </span>
              <Button size="sm" onClick={uploadFiles} disabled={uploading} className="h-8 text-xs">
                {uploading ? t("guest.uploading") : t("guest.uploadAll")}
              </Button>
            </div>

            {failedNotice && !uploading && (
              <div className="px-4 py-2.5 border-b border-destructive/20 bg-destructive/5 flex gap-2 items-start">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-destructive">{failedNotice}</p>
              </div>
            )}

            {uploading && (
              <div className="px-4 py-2.5 border-b border-border/30 bg-muted/10 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{t("guest.uploadingFiles")}</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} className="h-1.5" />
                {slowConnection && (
                  <p className="text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    {t("guest.slowConnection")}
                  </p>
                )}
                {statusLine && (
                  <p className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    {statusLine}
                  </p>
                )}
              </div>
            )}

            <ul className="max-h-52 overflow-y-auto divide-y divide-border/30">
              <AnimatePresence>
                {files.map((file, index) => (
                  <motion.li
                    key={`${file.name}-${file.size}-${index}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center gap-3 px-4 py-2.5 group"
                  >
                    <div className="w-9 h-9 rounded-md bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
                      {file.type.startsWith("image/") ? (
                        <PreviewImage file={file} />
                      ) : (
                        <Film className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{file.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(file.size / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    </div>
                    {!uploading && (
                      <button
                        onClick={() => removeFile(index)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {skippedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="bg-destructive/5 border border-destructive/20 rounded-xl overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-destructive/15 flex justify-between items-center">
              <span className="text-sm font-medium text-destructive flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {skippedFiles.length} {t("guest.skippedFiles")}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSkippedFiles([])}
                className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {t("guest.dismiss")}
              </Button>
            </div>
            <ul className="max-h-40 overflow-y-auto divide-y divide-destructive/10">
              {skippedFiles.map((file, index) => (
                <li key={`skipped-${index}`} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-9 h-9 rounded-md bg-destructive/10 flex-shrink-0 flex items-center justify-center">
                    <AlertCircle className="w-4 h-4 text-destructive/60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate line-through text-muted-foreground">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-destructive/70">{t("guest.unsupportedFormat")}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
