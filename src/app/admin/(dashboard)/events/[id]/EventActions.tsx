"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TripleConfirmDialog } from "@/components/TripleConfirmDialog";
import { toast } from "sonner";
import {
  PauseCircle,
  PlayCircle,
  Archive,
  ArchiveRestore,
  Trash2,
  Loader2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { EventStatus } from "@/lib/events";

type DangerAction = "disable" | "archive" | "delete";

export default function EventActions({
  eventId,
  status,
}: {
  eventId: string;
  status: EventStatus;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showDanger, setShowDanger] = useState(false);
  const [pending, setPending] = useState<DangerAction | null>(null);
  const [passwordError, setPasswordError] = useState(false);
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
      setPending(null);
      setShowDanger(false);
      router.refresh();
    } catch {
      toast.error("Request failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(password: string) {
    if (!password.trim()) {
      toast.error("Enter your admin password");
      return;
    }
    setDeleting(true);
    setPasswordError(false);
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "DELETE",
        headers: { "x-confirm-password": password },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setPasswordError(true);
        return;
      }
      if (!res.ok) {
        toast.error(data.error || "Delete failed");
        return;
      }
      toast.success(
        data.deletedUploads
          ? `Event deleted (${data.deletedUploads} files removed)`
          : "Event deleted"
      );
      setPending(null);
      router.push("/admin");
      router.refresh();
    } catch {
      toast.error("Delete request failed");
    } finally {
      setDeleting(false);
    }
  }

  const btn = "h-8 text-xs gap-1.5";

  const dialogConfig: Record<
    DangerAction,
    {
      title: string;
      confirmLabel: string;
      requirePassword: boolean;
      steps: [{ message: string }, { message: string }, { message: string; strong?: boolean }];
    }
  > = {
    disable: {
      title: "Disable this event?",
      confirmLabel: "Disable event",
      requirePassword: false,
      steps: [
        {
          message:
            "Guests will no longer be able to open the upload page or add photos while this event is disabled.",
        },
        {
          message:
            "You can re-enable later from this page. Existing photos stay on disk and in the gallery.",
        },
        {
          message: "Final check: disable guest uploads for this event now?",
          strong: true,
        },
      ],
    },
    archive: {
      title: "Archive this event?",
      confirmLabel: "Archive event",
      requirePassword: false,
      steps: [
        {
          message:
            "Archiving hides this event from the active list and blocks guest uploads. Photos stay on Mac and SSD.",
        },
        {
          message:
            "It will look empty if you only filter for active events — files are still there under Archived.",
        },
        {
          message: "Final check: archive this event now?",
          strong: true,
        },
      ],
    },
    delete: {
      title: "Delete this event permanently?",
      confirmLabel: "Delete forever",
      requirePassword: true,
      steps: [
        {
          message:
            "This permanently deletes the event and ALL guest uploads from Mac and SSD. There is no undo.",
        },
        {
          message:
            "Exports, QR links, and gallery history for this event will be gone forever. Double-check you picked the right event.",
        },
        {
          message: "Type your admin password to permanently delete this event and all files.",
          strong: true,
        },
      ],
    },
  };

  const cfg = pending ? dialogConfig[pending] : null;

  return (
    <>
      <div className="flex flex-col gap-2">
        {/* Safe / recovery actions — always visible */}
        <div className="flex flex-wrap items-center gap-2">
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

          {status === "archived" && (
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

          {!showDanger ? (
            <Button
              variant="ghost"
              size="sm"
              className={`${btn} text-muted-foreground hover:text-foreground`}
              onClick={() => setShowDanger(true)}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              Danger zone
              <ChevronDown className="w-3 h-3 opacity-60" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={`${btn} text-muted-foreground`}
              onClick={() => setShowDanger(false)}
            >
              Hide
              <ChevronUp className="w-3 h-3 opacity-60" />
            </Button>
          )}
        </div>

        {showDanger && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 space-y-2 max-w-lg">
            <p className="text-[11px] text-destructive/90 font-medium flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" />
              These actions need triple confirmation. Delete also needs your admin password.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {status === "active" && (
                <Button
                  variant="outline"
                  size="sm"
                  className={btn}
                  disabled={!!busy}
                  onClick={() => setPending("disable")}
                >
                  <PauseCircle className="w-3.5 h-3.5" />
                  Disable
                </Button>
              )}

              {status !== "archived" && (
                <Button
                  variant="outline"
                  size="sm"
                  className={btn}
                  disabled={!!busy}
                  onClick={() => setPending("archive")}
                >
                  <Archive className="w-3.5 h-3.5" />
                  Archive
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                className={`${btn} text-destructive border-destructive/40 hover:bg-destructive/10`}
                disabled={!!busy || deleting}
                onClick={() => {
                  setPasswordError(false);
                  setPending("delete");
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete event
              </Button>
            </div>
          </div>
        )}

        {status === "ended" && (
          <p className="text-[11px] text-amber-600 max-w-md">
            End date has passed — guest uploads are closed. To reopen: Edit Details → extend or
            clear the end date → then Enable.
          </p>
        )}
      </div>

      {cfg && pending && (
        <TripleConfirmDialog
          open={!!pending}
          onOpenChange={(o) => {
            if (!o) {
              setPending(null);
              setPasswordError(false);
            }
          }}
          title={cfg.title}
          steps={cfg.steps}
          confirmLabel={cfg.confirmLabel}
          requirePassword={cfg.requirePassword}
          isLoading={deleting || busy === pending}
          passwordError={passwordError}
          onPasswordChange={() => setPasswordError(false)}
          onConfirm={async (password) => {
            if (pending === "delete") {
              await handleDelete(password);
              return;
            }
            if (pending === "disable" || pending === "archive") {
              await runAction(pending);
            }
          }}
        />
      )}
    </>
  );
}
