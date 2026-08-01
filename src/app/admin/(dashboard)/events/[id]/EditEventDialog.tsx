"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import { useTranslation } from "@/components/TranslationProvider";

const toDateInput = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString().split("T")[0] : "";

export default function EditEventDialog({
  event
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
  }
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`/api/admin/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.status === 409) {
        toast.error(t("editEvent.slugTaken"));
        return;
      }
      if (!res.ok) throw new Error("Failed to update event");

      if (coverFile) {
        const fd = new FormData();
        fd.append("file", coverFile);
        const coverRes = await fetch(`/api/admin/events/${event.id}/cover`, {
          method: "POST",
          body: fd,
        });
        if (!coverRes.ok) throw new Error("Failed to upload cover image");
      }

      toast.success(t("editEvent.success"));
      setOpen(false);
      setCoverFile(null);
      router.refresh();
    } catch {
      toast.error(t("editEvent.error"));
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
              min="1"
              value={formData.maxFileSizeMB}
              onChange={(e) => setFormData({ ...formData, maxFileSizeMB: parseInt(e.target.value) || 100 })}
              required
            />
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

          {/* Cover image */}
          <div className="space-y-2">
            <Label htmlFor="edit-cover">{t("editEvent.customCoverIcon")}</Label>
            <Input
              id="edit-cover"
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
            />
            <p className="text-xs text-muted-foreground">{t("editEvent.customCoverIconDesc")}</p>
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
