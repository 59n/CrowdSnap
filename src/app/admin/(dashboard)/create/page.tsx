"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, CalendarDays, Globe, FileUp } from "lucide-react";
import Link from "next/link";
import { useTranslation } from "@/components/TranslationProvider";

export default function CreateEventPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    date: "",
    language: "en",
    maxFileSizeMB: 100,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          date: new Date(formData.date).toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Failed to create event");

      const data = await res.json();
      toast.success(t("createEvent.success"));
      router.push(`/admin/events/${data.id}`);
      router.refresh();
    } catch {
      toast.error(t("createEvent.error"));
      setLoading(false);
    }
  };

  const languages = [
    { value: "en", label: t("createEvent.english") },
    { value: "nl", label: t("createEvent.dutch") },
    { value: "es", label: t("createEvent.spanish") },
    { value: "fr", label: t("createEvent.french") },
    { value: "de", label: t("createEvent.german") },
    { value: "it", label: t("createEvent.italian") },
    { value: "pt", label: t("createEvent.portuguese") },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="rounded-full h-8 w-8 shrink-0">
          <Link href="/admin">
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t("createEvent.title")}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{t("createEvent.desc")}</p>
        </div>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event basics */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium">
                  {t("createEvent.eventName")}
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={t("createEvent.eventNamePlaceholder")}
                  required
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-sm font-medium">
                  {t("createEvent.description")}
                  <span className="text-muted-foreground font-normal ml-1">({t("createEvent.optional") ?? "optional"})</span>
                </Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t("createEvent.descriptionPlaceholder")}
                  className="resize-none min-h-[80px]"
                />
              </div>
            </div>

            <Separator className="border-border/40" />

            {/* Date & settings */}
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> Settings
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="date" className="text-sm font-medium">
                    {t("createEvent.eventDate")}
                  </Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="maxSize" className="text-sm font-medium flex items-center gap-1.5">
                    <FileUp className="w-3.5 h-3.5" /> {t("editEvent.maxFileSize")}
                  </Label>
                  <div className="relative">
                    <Input
                      id="maxSize"
                      type="number"
                      min="1"
                      max="2000"
                      value={formData.maxFileSizeMB}
                      onChange={(e) => setFormData({ ...formData, maxFileSizeMB: parseInt(e.target.value) || 100 })}
                      required
                      className="h-9 pr-12"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">MB</span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5" /> {t("createEvent.guestLanguage")}
                  </Label>
                  <Select
                    value={formData.language}
                    onValueChange={(value) => setFormData({ ...formData, language: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((lang) => (
                        <SelectItem key={lang.value} value={lang.value}>
                          {lang.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator className="border-border/40" />

            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" size="sm" asChild>
                <Link href="/admin">{t("createEvent.cancel") ?? "Cancel"}</Link>
              </Button>
              <Button type="submit" disabled={loading} size="sm">
                {loading ? t("createEvent.creating") : t("createEvent.createEvent")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
