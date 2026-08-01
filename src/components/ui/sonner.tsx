"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * High-contrast toasts that work without ThemeProvider.
 * (Guest pages don't wrap next-themes — "system"/"dark" made white-on-white text.)
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      richColors
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-zinc-900 group-[.toaster]:border-zinc-200 group-[.toaster]:shadow-lg",
          title: "group-[.toast]:text-zinc-900 group-[.toast]:font-semibold",
          description: "group-[.toast]:text-zinc-600",
          error:
            "group-[.toaster]:bg-red-50 group-[.toaster]:text-red-900 group-[.toaster]:border-red-200",
          success:
            "group-[.toaster]:bg-green-50 group-[.toaster]:text-green-900 group-[.toaster]:border-green-200",
          warning:
            "group-[.toaster]:bg-amber-50 group-[.toaster]:text-amber-950 group-[.toaster]:border-amber-200",
          info: "group-[.toaster]:bg-sky-50 group-[.toaster]:text-sky-950 group-[.toaster]:border-sky-200",
        },
      }}
      style={
        {
          "--normal-bg": "#ffffff",
          "--normal-text": "#18181b",
          "--normal-border": "#e4e4e7",
          "--success-bg": "#f0fdf4",
          "--success-text": "#14532d",
          "--success-border": "#bbf7d0",
          "--error-bg": "#fef2f2",
          "--error-text": "#7f1d1d",
          "--error-border": "#fecaca",
          "--warning-bg": "#fffbeb",
          "--warning-text": "#78350f",
          "--warning-border": "#fde68a",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
