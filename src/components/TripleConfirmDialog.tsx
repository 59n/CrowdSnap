"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle } from "lucide-react";

export type TripleConfirmStep = {
  /** Warning body for this step */
  message: string;
  /** Optional extra emphasis (font weight) */
  strong?: boolean;
};

interface TripleConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  steps: [TripleConfirmStep, TripleConfirmStep, TripleConfirmStep];
  /** Final button label (step 3). Default: "Confirm" */
  confirmLabel?: string;
  /** Require admin password on step 3 */
  requirePassword?: boolean;
  isLoading?: boolean;
  /** Called only after all 3 steps (password included when required) */
  onConfirm: (password: string) => void | Promise<void>;
  passwordError?: boolean;
  onPasswordChange?: () => void;
}

/**
 * 3-step confirm for destructive actions (same pattern as “Delete all”).
 * Steps 1–2 are Next →; step 3 runs onConfirm (optionally with password).
 */
export function TripleConfirmDialog({
  open,
  onOpenChange,
  title,
  steps,
  confirmLabel = "Confirm",
  requirePassword = false,
  isLoading = false,
  onConfirm,
  passwordError = false,
  onPasswordChange,
}: TripleConfirmDialogProps) {
  const [step, setStep] = useState(1);
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!open) {
      setStep(1);
      setPassword("");
    }
  }, [open]);

  const current = steps[step - 1];

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o && isLoading) return;
        onOpenChange(o);
      }}
      title={title}
      confirmLabel={step < 3 ? "Next →" : confirmLabel}
      variant="destructive"
      isLoading={isLoading}
      onConfirm={() => {
        if (step < 3) {
          setStep((s) => s + 1);
          return;
        }
        if (requirePassword && !password.trim()) return;
        void onConfirm(password);
      }}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {[1, 2, 3].map((s) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-destructive" : "bg-muted"
              }`}
            />
          ))}
          <span className="ml-1 text-muted-foreground/70">Step {step} of 3</span>
        </div>

        <div
          className={`flex items-start gap-3 rounded-lg border p-3 text-sm text-destructive ${
            step === 1
              ? "border-destructive/30 bg-destructive/5"
              : step === 2
                ? "border-destructive/40 bg-destructive/10 font-medium"
                : "border-destructive/50 bg-destructive/15 font-semibold"
          } ${current.strong ? "font-semibold" : ""}`}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{current.message}</span>
        </div>

        {step === 3 && requirePassword && (
          <div className="space-y-1.5">
            <Label htmlFor="triple-confirm-pw" className="text-xs">
              Enter admin password to confirm
            </Label>
            <Input
              id="triple-confirm-pw"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                onPasswordChange?.();
              }}
              placeholder="Admin password"
              autoComplete="current-password"
              autoFocus
              className={passwordError ? "border-destructive" : undefined}
              onKeyDown={(e) => {
                if (e.key === "Enter" && password.trim()) void onConfirm(password);
              }}
            />
            {passwordError && (
              <p className="text-xs text-destructive">Incorrect password.</p>
            )}
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
