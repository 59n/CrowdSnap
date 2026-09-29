"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const HeroIntroContext = createContext<() => void>(() => {});

/**
 * Marks the guest page so CSS can play the intro → compact settle.
 * Starts after the banner image has loaded (or a short fallback).
 * Tap / scroll skips to the compact layout.
 */
export function GuestHeroIntroProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [phase, setPhase] = useState<"wait" | "play" | "skip">("wait");

  const markReady = useCallback(() => {
    setPhase((p) => (p === "skip" ? p : "play"));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPhase("skip");
      return;
    }
    // Wait long enough for a slow image to arrive before the hero settles.
    const fallback = window.setTimeout(markReady, 12000);
    return () => window.clearTimeout(fallback);
  }, [enabled, markReady]);

  useEffect(() => {
    if (!enabled || phase !== "play") return;
    const skip = () => setPhase("skip");
    const id = window.setTimeout(() => {
      window.addEventListener("wheel", skip, { once: true, passive: true });
      window.addEventListener("touchstart", skip, { once: true, passive: true });
      window.addEventListener("keydown", skip, { once: true });
    }, 500);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchstart", skip);
      window.removeEventListener("keydown", skip);
    };
  }, [enabled, phase]);

  if (!enabled) return children;

  return (
    <HeroIntroContext.Provider value={markReady}>
      <div data-hero-intro={phase}>
        {children}
      </div>
    </HeroIntroContext.Provider>
  );
}

/**
 * Full-bleed top hero image for the guest page.
 * Soft vertical fade into the page background so title/text stay readable.
 * On phones: holds the tall crop, then eases up to the compact layout.
 */
export default function GuestHeroBanner({
  eventId,
  muted = false,
  cacheKey,
}: {
  eventId: string;
  muted?: boolean;
  cacheKey?: string | number;
}) {
  const markReady = useContext(HeroIntroContext);
  const imgRef = useRef<HTMLImageElement>(null);
  const [attempt, setAttempt] = useState(0);
  const src = `/api/p/${eventId}/banner?v=${cacheKey ?? 0}${attempt ? `&r=${attempt}` : ""}`;

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) markReady();
  }, [markReady, src]);

  return (
    <div
      className="guest-hero-banner pointer-events-none absolute inset-x-0 top-0 z-0 w-full overflow-hidden"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt=""
        fetchPriority="high"
        onLoad={() => markReady()}
        onError={() => {
          fetch("/api/logs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              event: attempt < 6 ? "hero.retry" : "hero.failed",
              eventId,
              attempt,
            }),
            keepalive: true,
          }).catch(() => {});
          if (attempt < 6) {
            window.setTimeout(() => setAttempt((n) => n + 1), 800 * (attempt + 1));
          }
        }}
        className={`guest-hero-img h-full w-full object-cover object-center ${muted ? "opacity-70 grayscale-[30%]" : ""}`}
      />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 via-black/10 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/25 to-background" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
