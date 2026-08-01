import type { NextConfig } from "next";

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
  allowedDevOrigins: ["foto.thenas.us", "pangolin.thenas.us", "100.123.80.96"],
};

export default nextConfig;
