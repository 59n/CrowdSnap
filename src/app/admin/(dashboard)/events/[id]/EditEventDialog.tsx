"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import { useTranslation } from "@/components/TranslationProvider";
import { MAX_MAX_FILE_MB, MIN_MAX_FILE_MB } from "@/lib/file-type";

/**
 * Calendar day for <input type="date"> — use local Y/M/D, not toISOString()
 * (UTC can shift the day for non-UTC timezones).
 */
function toDateInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD → stable noon UTC so the calendar day is unambiguous. */
function dateInputToApi(dateStr: string): string {
  return `${dateStr}T12:00:00.000Z`;
}

export default function EditEventDialog({
  event,
  hasBannerImage = false,
  hasCoverImage = false,
  coverCacheKey = 0,
  bannerCacheKey = 0,
}: {
  event: {
    id: string;
    name: string;
    description: string | null;
    date: Date;
    endDate?: Date | null;
    slug?: string | null;
    language: string;
    maxFileSizeMB: number;
    guestGalleryEnabled?: boolean;
  };
  hasBannerImage?: boolean;
  hasCoverImage?: boolean;
  coverCacheKey?: number;
  bannerCacheKey?: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [removeBanner, setRemoveBanner] = useState(false);
  const [formData, setFormData] = useState({
    name: event.name,
    description: event.description || "",
    date: toDateInput(event.date),
    endDate: toDateInput(event.endDate),
    slug: event.slug || "",
    language: event.language,
    maxFileSizeMB: event.maxFileSizeMB,
    guestGalleryEnabled: event.guestGalleryEnabled ?? true,
  });
  const { t } = useTranslation();

  // Re-sync form when opening dialog / server props refresh
  useEffect(() => {
    if (!open) return;
    setFormData({
      name: event.name,
      description: event.description || "",
      date: toDateInput(event.date),
      endDate: toDateInput(event.endDate),
      slug: event.slug || "",
      language: event.language,
      maxFileSizeMB: event.maxFileSizeMB,
      guestGalleryEnabled: event.guestGalleryEnabled ?? true,
    });
    setCoverFile(null);
    setBannerFile(null);
    setRemoveCover(false);
    setRemoveBanner(false);
  }, [open, event]);

  useEffect(() => {
    if (!bannerFile) {
      setBannerPreview(null);
      return;
    }
    const url = URL.createObjectURL(bannerFile);
    setBannerPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [bannerFile]);

  useEffect(() => {
    if (!coverFile) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(coverFile);
    setCoverPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [coverFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (formData.endDate && formData.date && formData.endDate < formData.date) {
        toast.error(
          t("editEvent.endBeforeStart") || "End date cannot be before the event date."
        );
        return;
      }

      const payload = {
        ...formData,
        date: formData.date ? dateInputToApi(formData.date) : formData.date,
        endDate: formData.endDate ? dateInputToApi(formData.endDate) : formData.endDate,
      };

      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast.error(t("editEvent.slugTaken"));
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || t("editEvent.error"));
      }

      // Media is optional — details already saved; don't fail the whole save as “error”
      const mediaErrors: string[] = [];

      if (removeCover && !coverFile) {
        const del = await fetch(`/api/admin/events/${event.id}/cover`, {
          method: "DELETE",
        });
        if (!del.ok) mediaErrors.push("cover remove");
      } else if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        const coverRes = await fetch(`/api/admin/events/${event.id}/cover`, {
          method: "POST",
          body: fd,
        });
        if (!coverRes.ok) mediaErrors.push("cover upload");
      }

      if (removeBanner && !bannerFile) {
        const del = await fetch(`/api/admin/events/${event.id}/banner`, {
          method: "DELETE",
        });
        if (!del.ok) mediaErrors.push("banner remove");
      } else if (bannerFile) {
        const fd = new FormData();
        fd.append("file", bannerFile);
        const bannerRes = await fetch(`/api/admin/events/${event.id}/banner`, {
          method: "POST",
          body: fd,
        });
        if (!bannerRes.ok) mediaErrors.push("banner upload");
      }

      if (mediaErrors.length) {
        toast.warning(
          t("editEvent.detailsSavedMediaFailed") ||
            `Details saved, but image update failed (${mediaErrors.join(", ")}). Try the image again.`
        );
      } else {
        toast.success(t("editEvent.success"));
      }

      setOpen(false);
      setCoverFile(null);
      setBannerFile(null);
      setRemoveCover(false);
      setRemoveBanner(false);

      const mediaChanged =
        !!coverFile || !!bannerFile || removeCover || removeBanner;
      router.refresh();
      if (mediaChanged) {
        // Bust cached cover/banner URLs in the browser
        window.location.reload();
      }
    } catch (err) {
      toast.error((err as Error).message || t("editEvent.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex-1 sm:flex-none">
          <Settings className="w-4 h-4 mr-2" /> {t("admin.editDetails")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editEvent.title")}</DialogTitle>
          <DialogDescription>{t("editEvent.desc")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t("createEvent.eventName")}</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="edit-description">{t("createEvent.description")}</Label>
            <textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-date">{t("editEvent.eventDate")}</Label>
              <Input
                id="edit-date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-endDate">{t("editEvent.endDate")}</Label>
              <Input
                id="edit-endDate"
                type="date"
                value={formData.endDate}
                min={formData.date}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Language */}
          <div className="space-y-2">
            <Label htmlFor="edit-language">{t("createEvent.guestLanguage")}</Label>
            <select
              id="edit-language"
              value={formData.language}
              onChange={(e) => setFormData({ ...formData, language: e.target.value })}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="en">{t("createEvent.english")} (English)</option>
              <option value="nl">{t("createEvent.dutch")} (Nederlands)</option>
              <option value="es">{t("createEvent.spanish")} (Español)</option>
              <option value="fr">{t("createEvent.french")} (Français)</option>
              <option value="de">{t("createEvent.german")} (Deutsch)</option>
              <option value="it">{t("createEvent.italian")} (Italiano)</option>
              <option value="pt">{t("createEvent.portuguese")} (Português)</option>
            </select>
          </div>

          {/* Max file size */}
          <div className="space-y-2">
            <Label htmlFor="edit-maxFileSizeMB">{t("editEvent.maxFileSize")}</Label>
            <Input
              id="edit-maxFileSizeMB"
              type="number"
              min={MIN_MAX_FILE_MB}
              max={MAX_MAX_FILE_MB}
              value={formData.maxFileSizeMB}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  maxFileSizeMB: parseInt(e.target.value, 10) || 100,
                })
              }
              required
            />
            <p className="text-xs text-muted-foreground">
              {MIN_MAX_FILE_MB}–{MAX_MAX_FILE_MB} MB per file (videos often need 500–1000+)
            </p>
          </div>

          {/* Custom slug */}
          <div className="space-y-2">
            <Label htmlFor="edit-slug">{t("editEvent.slug")}</Label>
            <div className="flex items-center rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              <span className="px-3 py-2 text-xs text-muted-foreground bg-muted border-r border-input whitespace-nowrap">/p/</span>
              <input
                id="edit-slug"
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                placeholder={t("editEvent.slugPlaceholder")}
                className="flex-1 px-3 py-2 text-sm bg-background outline-none"
              />
            </div>
            <p className="text-xs text-muted-foreground">{t("editEvent.slugDesc")}</p>
          </div>

          {/* Guest gallery toggle */}
          <div className="flex items-center justify-between rounded-md border border-input px-3 py-2.5">
            <div>
              <Label htmlFor="edit-guestGallery" className="cursor-pointer">{t("editEvent.guestGallery")}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{t("editEvent.guestGalleryDesc")}</p>
            </div>
            <input
              id="edit-guestGallery"
              type="checkbox"
              checked={formData.guestGalleryEnabled}
              onChange={(e) => setFormData({ ...formData, guestGalleryEnabled: e.target.checked })}
              className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
            />
          </div>

          {/* Cover image (circular avatar) */}
          <div className="space-y-2">
            <Label htmlFor="edit-cover">{t("editEvent.customCoverIcon")}</Label>
            <Input
              id="edit-cover"
              type="file"
              accept="image/*"
              disabled={removeCover}
              onChange={(e) => {
                setCoverFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveCover(false);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("editEvent.customCoverIconDesc")}</p>
            {hasCoverImage && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={removeCover}
                  onChange={(e) => {
                    setRemoveCover(e.target.checked);
                    if (e.target.checked) setCoverFile(null);
                  }}
                  className="h-3.5 w-3.5 rounded border-input accent-destructive"
                />
                {t("editEvent.removeCoverIcon")}
              </label>
            )}
            {(hasCoverImage || coverPreview) && !removeCover && (
              <div className="w-16 h-16 rounded-full overflow-hidden border border-border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    coverPreview ||
                    `/api/p/${event.id}/cover?v=${coverCacheKey}`
                  }
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          {/* Full-width hero banner behind cover */}
          <div className="space-y-2">
            <Label htmlFor="edit-banner">{t("editEvent.heroBanner")}</Label>
            <Input
              id="edit-banner"
              type="file"
              accept="image/*"
              disabled={removeBanner}
              onChange={(e) => {
                setBannerFile(e.target.files?.[0] || null);
                if (e.target.files?.[0]) setRemoveBanner(false);
              }}
            />
            <p className="text-xs text-muted-foreground">{t("editEvent.heroBannerDesc")}</p>
            {hasBannerImage && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={removeBanner}
                  onChange={(e) => {
                    setRemoveBanner(e.target.checked);
                    if (e.target.checked) setBannerFile(null);
                  }}
                  className="h-3.5 w-3.5 rounded border-input accent-destructive"
                />
                {t("editEvent.removeHeroBanner")}
              </label>
            )}
            {(hasBannerImage || bannerPreview) && !removeBanner && (
              <div className="rounded-md overflow-hidden border border-border/60 h-20 bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    bannerPreview ||
                    `/api/p/${event.id}/banner?v=${bannerCacheKey}`
                  }
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? t("editEvent.saving") : t("editEvent.saveChanges")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
