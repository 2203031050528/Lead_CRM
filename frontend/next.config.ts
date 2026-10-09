import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const apiOrigin = process.env.DEV_API_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // Production: static export to `out/`, served by Nginx. No Node process on EC2.
  ...(isProd ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  // Django URLs end in "/"; don't let Next strip it before proxying.
  skipTrailingSlashRedirect: true,
  ...(!isProd && {
    async rewrites() {
      return [
        { source: "/api/:path*/", destination: `${apiOrigin}/api/:path*/` },
        { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
        { source: "/admin/:path*", destination: `${apiOrigin}/admin/:path*` },
        { source: "/static/:path*", destination: `${apiOrigin}/static/:path*` },
      ];
    },
  }),
};

export default nextConfig;
