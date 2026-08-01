"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  HardDrive,
  Shield,
  Server,
  Network,
  Save,
  Loader2,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";

type FieldMeta = {
  key: string;
  label: string;
  description: string;
  category: "storage" | "auth" | "server" | "tunnel";
  type: "string" | "number" | "password" | "path";
  secret?: boolean;
  restartRequired?: boolean;
  placeholder?: string;
  optional?: boolean;
};

const CATEGORY_META: Record<
  FieldMeta["category"],
  { title: string; description: string; icon: React.ReactNode }
> = {
  storage: {
    title: "Storage",
    description: "Where photos live, backup SSD, and overflow thresholds.",
    icon: <HardDrive className="w-4 h-4" />,
  },
  auth: {
    title: "Auth & public URL",
    description: "Admin password, session secret, and the public base URL for QR codes.",
    icon: <Shield className="w-4 h-4" />,
  },
  server: {
    title: "Database & server",
    description: "Postgres / connection settings. Most require a restart to fully apply.",
    icon: <Server className="w-4 h-4" />,
  },
  tunnel: {
    title: "Tunnel (optional)",
    description: "Pangolin / Newt settings used by docker compose.",
    icon: <Network className="w-4 h-4" />,
  },
};

export default function SettingsForm() {
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data) => {
        setFields(data.fields || []);
        const next: Record<string, string> = {};
        for (const f of data.fields as FieldMeta[]) {
          const v = data.values?.[f.key];
          if (f.secret) {
            // Blank secrets = "leave unchanged" on save
            next[f.key] = "";
          } else if (v === null || v === undefined) {
            next[f.key] = "";
          } else {
            next[f.key] = String(v);
          }
        }
        setValues(next);
      })
      .catch(() => toast.error("Could not load settings"))
      .finally(() => setLoading(false));
  }, []);

  const byCategory = useMemo(() => {
    const order: FieldMeta["category"][] = ["storage", "auth", "server", "tunnel"];
    return order.map((cat) => ({
      cat,
      meta: CATEGORY_META[cat],
      fields: fields.filter((f) => f.category === cat),
    }));
  }, [fields]);

  function updateField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPassword) {
      toast.error("Enter your current admin password to save");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, string | number> = {};
      for (const f of fields) {
        const raw = values[f.key] ?? "";
        if (f.secret && raw === "") continue; // leave unchanged
        if (f.type === "number") {
          const n = Number(raw);
          if (!Number.isFinite(n)) {
            toast.error(`${f.label} must be a number`);
            setSaving(false);
            return;
          }
          payload[f.key] = n;
        } else {
          payload[f.key] = raw;
        }
      }

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: payload, currentPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Save failed");
        return;
      }

      // Reset secret fields to blank (placeholder for unchanged)
      setValues((prev) => {
        const next = { ...prev };
        for (const f of fields) {
          if (f.secret) next[f.key] = "";
          else if (data.values?.[f.key] !== undefined && !f.secret) {
            next[f.key] = String(data.values[f.key] ?? "");
          }
        }
        return next;
      });
      setDirty(false);
      setCurrentPassword("");

      if (data.restartRequired?.length) {
        toast.success(
          `Saved. Restart the server for: ${data.restartRequired.join(", ")}`,
          { duration: 8000 }
        );
      } else {
        toast.success("Settings saved — applied immediately where possible");
      }
    } catch {
      toast.error("Save request failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading settings…
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-2xl">
      <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-xs text-amber-900 dark:text-amber-200 flex gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">Changes are saved to local settings and mirrored to .env for restarts.</p>
          <p className="pt-1">Secret fields left blank keep their current value. Database / session secret changes need a server restart. Storage paths cannot use path traversal.</p>
        </div>
      </div>

      {byCategory.map(({ cat, meta, fields: catFields }) =>
        catFields.length === 0 ? null : (
          <Card key={cat}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                {meta.icon}
                {meta.title}
              </CardTitle>
              <CardDescription className="text-xs">{meta.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {catFields.map((f) => {
                const isSecret = !!f.secret;
                const show = showSecrets[f.key];
                return (
                  <div key={f.key} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={f.key} className="text-sm">
                        {f.label}
                        {f.restartRequired && (
                          <span className="ml-2 text-[10px] font-normal text-amber-600">
                            restart required
                          </span>
                        )}
                      </Label>
                      {isSecret && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground p-0.5"
                          onClick={() =>
                            setShowSecrets((s) => ({ ...s, [f.key]: !s[f.key] }))
                          }
                          aria-label={show ? "Hide" : "Show"}
                        >
                          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        id={f.key}
                        type={
                          f.type === "number"
                            ? "number"
                            : isSecret && !show
                              ? "password"
                              : "text"
                        }
                        value={values[f.key] ?? ""}
                        onChange={(e) => updateField(f.key, e.target.value)}
                        placeholder={
                          isSecret
                            ? "••••••••  (leave blank to keep current)"
                            : f.placeholder || ""
                        }
                        autoComplete="off"
                        className="font-mono text-sm"
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {f.description}
                    </p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )
      )}

      <Separator />

      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Confirm &amp; save</CardTitle>
          <CardDescription className="text-xs">
            Enter your current admin password to apply changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="currentPassword">Current admin password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" disabled={saving || !dirty} className="gap-2">
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? "Saving…" : dirty ? "Save settings" : "No changes"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
