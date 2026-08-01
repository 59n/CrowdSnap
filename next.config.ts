import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: ["foto.thenas.us", "pangolin.thenas.us","100.123.80.96"],
};

export default nextConfig;
