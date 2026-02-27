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

export default function EditEventDialog({ 
  event 
}: { 
  event: { id: string, name: string, description: string | null, language: string, maxFileSizeMB: number } 
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: event.name,
    description: event.description || "",
    language: event.language,
    maxFileSizeMB: event.maxFileSizeMB,
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

      if (!res.ok) throw new Error("Failed to update event");
      
      if (coverFile) {
        const formData = new FormData();
        formData.append("file", coverFile);
        const coverRes = await fetch(`/api/admin/events/${event.id}/cover`, {
          method: "POST",
          body: formData,
        });
        if (!coverRes.ok) throw new Error("Failed to upload cover image");
      }
      
      toast.success(t("editEvent.success"));
      setOpen(false);
      setCoverFile(null);
      router.refresh();
    } catch (error) {
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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t("editEvent.title")}</DialogTitle>
          <DialogDescription>
            {t("editEvent.desc")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">{t("createEvent.eventName")}</Label>
            <Input
              id="edit-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">{t("createEvent.description")}</Label>
            <textarea
              id="edit-description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
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
