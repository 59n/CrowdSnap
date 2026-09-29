"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#0a0a0a",
          color: "#fafafa",
        }}
      >
        <div style={{ textAlign: "center", padding: "1.25rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.75rem" }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", opacity: 0.7, margin: "0 0 1.25rem" }}>
            CrowdSnap hit an unexpected error. Try reloading this page.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              border: 0,
              borderRadius: 8,
              padding: "0.5rem 1rem",
              background: "#fafafa",
              color: "#0a0a0a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
