"use client";

import { useState, useEffect, useCallback } from "react";
import { Trash2, Film, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTranslation } from "./TranslationProvider";
import { ConfirmDialog } from "./ConfirmDialog";

interface GuestUpload {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

interface GuestGalleryProps {
  eventId: string;
}

function GuestThumb({
  eventId,
  uploadId,
  alt,
}: {
  eventId: string;
  uploadId: string;
  alt: string;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/p/${eventId}/thumb/${uploadId}${attempt ? `?r=${attempt}` : ""}`}
      alt={alt}
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => {
        if (attempt < 8) {
          window.setTimeout(() => setAttempt((n) => n + 1), 700);
        }
      }}
    />
  );
}

function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem("crowdsnap_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("crowdsnap_device_id", id);
  }
  return id;
}

export default function GuestGallery({ eventId }: GuestGalleryProps) {
  const { t } = useTranslation();
  const [uploads, setUploads] = useState<GuestUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GuestUpload | null>(null);

  const fetchUploads = useCallback(async () => {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    try {
      const res = await fetch(`/api/p/${eventId}/uploads`, {
        headers: { "x-device-id": deviceId },
      });
      if (res.ok) {
        const data = await res.json();
        setUploads(data.uploads || []);
      }
    } catch {
      // Silently ignore – non-critical
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    fetchUploads();
  }, [fetchUploads]);

  // Re-fetch when uploads complete
  useEffect(() => {
    const handler = () => fetchUploads();
    window.addEventListener("crowdsnap:uploaded", handler);
    return () => window.removeEventListener("crowdsnap:uploaded", handler);
  }, [fetchUploads]);

  const handleDelete = async (upload: GuestUpload) => {
    const deviceId = getDeviceId();
    if (!deviceId) return;

    setDeletingId(upload.id);
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/p/${eventId}/uploads/${upload.id}`, {
        method: "DELETE",
        headers: { "x-device-id": deviceId },
      });

      if (res.ok) {
        setUploads((prev) => prev.filter((u) => u.id !== upload.id));
        toast.success(t("guest.removedUpload"));
      } else {
        toast.error(t("guest.failedRemove"));
      }
    } catch {
      toast.error(t("guest.failedRemove"));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || uploads.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-xl mx-auto mt-10"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-border/40" />
        <span className="text-xs text-muted-foreground/50 font-medium uppercase tracking-widest">
          {t("guest.yourUploads")}
        </span>
        <div className="flex-1 h-px bg-border/40" />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <AnimatePresence>
          {uploads.map((upload) => {
            const isImage = upload.mimeType.startsWith("image/");
            const isDeleting = deletingId === upload.id;

            return (
              <motion.div
                key={upload.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
                className="relative aspect-square rounded-xl overflow-hidden bg-muted group"
              >
                {isImage ? (
                  <GuestThumb eventId={eventId} uploadId={upload.id} alt={upload.originalName} />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted/80 gap-1.5">
                    <Film className="w-7 h-7 text-muted-foreground/60" />
                    <span className="text-[10px] text-muted-foreground/60 px-2 text-center truncate max-w-full">
                      {upload.originalName}
                    </span>
                  </div>
                )}

                {/* Hover overlay — desktop only */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity items-center justify-center hidden [@media(hover:hover)]:flex">
                  <button
                    onClick={() => setPendingDelete(upload)}
                    disabled={isDeleting}
                    className="p-2.5 rounded-full bg-destructive/90 hover:bg-destructive text-white transition-colors disabled:opacity-50"
                    title={t("guest.removeUpload")}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* Always-visible delete button — touch devices only */}
                <div className="absolute top-1.5 right-1.5 [@media(hover:hover)]:hidden">
                  <button
                    onClick={() => setPendingDelete(upload)}
                    disabled={isDeleting}
                    className="p-1.5 rounded-full bg-black/60 text-white backdrop-blur-sm disabled:opacity-50"
                    title={t("guest.removeUpload")}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <p className="text-[11px] text-muted-foreground/60 text-center mt-3">
        {t("guest.yourUploadsDesc")}
      </p>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => { if (!open) setPendingDelete(null); }}
        title={t("guest.removeUpload")}
        description={t("guest.confirmRemove")}
        confirmLabel={t("guest.removeUpload")}
        cancelLabel={t("guest.dismiss")}
        isLoading={deletingId === pendingDelete?.id}
        onConfirm={() => { if (pendingDelete) handleDelete(pendingDelete); }}
      />
    </motion.div>
  );
}
