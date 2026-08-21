/**
 * Full-bleed top hero image for the guest page.
 * Soft vertical fade into the page background so title/text stay readable.
 */
export default function GuestHeroBanner({
  eventId,
  muted = false,
  /** File mtime (or similar) so browsers load a new image after replace */
  cacheKey,
}: {
  eventId: string;
  /** Closed/ended state — slightly dimmer */
  muted?: boolean;
  cacheKey?: string | number;
}) {
  const src = cacheKey
    ? `/api/p/${eventId}/banner?v=${cacheKey}`
    : `/api/p/${eventId}/banner`;

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[min(48vh,380px)] w-full overflow-hidden"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`h-full w-full object-cover object-center ${muted ? "opacity-70 grayscale-[30%]" : ""}`}
      />
      {/* Top vignette so language switcher stays readable */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 via-black/10 to-transparent" />
      {/* Main fade into page background */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/25 to-background" />
      {/* Extra soft bottom blend */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}
