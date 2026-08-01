"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "sonner";
import {
  PauseCircle,
  PlayCircle,
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
} from "lucide-react";
import type { EventStatus } from "@/lib/events";

export default function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function runAction(action: "enable" | "disable" | "archive" | "unarchive") {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Action failed");
        return;
      }
      const messages: Record<string, string> = {
        enable: "Event enabled — guests can upload again",
        disable: "Event disabled — guest uploads blocked",
        archive: "Event archived",
        unarchive: "Event restored from archive (still disabled)",
      };
      toast.success(messages[action] || "Updated");
      router.refresh();
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!password) {
      toast.error("Enter your admin password");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
        headers: { "x-confirm-password": password },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success(
        data.deletedUploads
          ? `Event deleted (${data.deletedUploads} files removed)`
          : "Event deleted"
      );
      setDeleteOpen(false);
      router.push("/admin");
      router.refresh();
    } catch {
      toast.error("Delete request failed");
    } finally {
      setDeleting(false);
      setPassword("");
    }
  }

  const btn = "h-8 text-xs gap-1.5";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "active" && (
          <Button
            variant="outline"
            size="sm"
            className={btn}
            disabled={!!busy}
            onClick={() => runAction("disable")}
          >
            {busy === "disable" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PauseCircle className="w-3.5 h-3.5" />
            )}
            Disable
          </Button>
        )}

        {status === "disabled" && (
          <Button
            variant="outline"
            size="sm"
            className={btn}
            disabled={!!busy}
            onClick={() => runAction("enable")}
          >
            {busy === "enable" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <PlayCircle className="w-3.5 h-3.5" />
            )}
            Enable
          </Button>
        )}

        {status !== "archived" ? (
          <Button
            variant="outline"
            size="sm"
            className={btn}
            disabled={!!busy}
            onClick={() => runAction("archive")}
          >
            {busy === "archive" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Archive className="w-3.5 h-3.5" />
            )}
            Archive
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className={btn}
            disabled={!!busy}
            onClick={() => runAction("unarchive")}
          >
            {busy === "unarchive" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArchiveRestore className="w-3.5 h-3.5" />
            )}
            Unarchive
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          className={`${btn} text-destructive border-destructive/40 hover:bg-destructive/10`}
          disabled={!!busy}
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </Button>
      </div>

      {status === "ended" && (
        <p className="text-[11px] text-amber-600 mt-1.5 max-w-md">
          End date has passed — guest uploads are closed. To reopen: Edit Details → extend or clear
          the end date → then Enable.
        </p>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(o) => {
          setDeleteOpen(o);
          if (!o) setPassword("");
        }}
        title="Delete this event permanently?"
        description="This removes the event, all guest uploads, and files on Mac and SSD. This cannot be undone."
        confirmLabel="Delete forever"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDelete}
      >
        <div className="space-y-2 py-2">
          <Label htmlFor="delete-event-pw">Admin password</Label>
          <Input
            id="delete-event-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Confirm with your password"
            autoComplete="current-password"
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
