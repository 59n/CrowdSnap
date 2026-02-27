"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
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
    } catch (error) {
      toast.error(t("createEvent.error"));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="rounded-full">
          <Link href="/admin">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">{t("createEvent.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("createEvent.desc")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t("createEvent.eventName")}</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("createEvent.eventNamePlaceholder")}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("createEvent.description")}</Label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t("createEvent.descriptionPlaceholder")}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="date">{t("createEvent.eventDate")}</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxSize">{t("editEvent.maxFileSize")}</Label>
                <Input
                  id="maxSize"
                  type="number"
                  min="1"
                  max="2000"
                  value={formData.maxFileSizeMB}
                  onChange={(e) => setFormData({ ...formData, maxFileSizeMB: parseInt(e.target.value) || 100 })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="language">{t("createEvent.guestLanguage")}</Label>
                <select
                  id="language"
                  value={formData.language}
                  onChange={(e) => setFormData({ ...formData, language: e.target.value })}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  <option value="en">{t("createEvent.english")}</option>
                  <option value="nl">{t("createEvent.dutch")}</option>
                  <option value="es">{t("createEvent.spanish")}</option>
                  <option value="fr">{t("createEvent.french")}</option>
                  <option value="de">{t("createEvent.german")}</option>
                  <option value="it">{t("createEvent.italian")}</option>
                  <option value="pt">{t("createEvent.portuguese")}</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={loading} size="lg">
                {loading ? t("createEvent.creating") : t("createEvent.createEvent")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
