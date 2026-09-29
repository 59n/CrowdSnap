import type { NextConfig } from "next";

const devOrigins = process.env.ALLOWED_DEV_ORIGINS
  ? process.env.ALLOWED_DEV_ORIGINS.split(",").map((s) => s.trim())
  : undefined;

const nextConfig: NextConfig = {
  output: "standalone",
  // Hide X-Powered-By
  poweredByHeader: false,
  // Gzip/brotli handled by Node/host; keep compress on for next start
  compress: true,
  // Production image/runtime hints
  images: {
    // Local media is served via API streams, not next/image remote
    unoptimized: false,
  },
  // Experimental package import optimization for smaller client bundles
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "framer-motion"],
  },
  ...(devOrigins ? { allowedDevOrigins: devOrigins } : {}),
};

export default nextConfig;
