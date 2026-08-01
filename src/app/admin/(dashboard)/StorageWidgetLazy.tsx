"use client";

/**
 * Client boundary for the storage sidebar widget.
 * Keep `dynamic(..., { ssr: false })` out of Server Components (Next 16 forbids it).
 * StorageWidget is already a client component and renders a skeleton until data loads.
 */
import StorageWidget from "./StorageWidget";

export default function StorageWidgetLazy() {
  return <StorageWidget />;
}
