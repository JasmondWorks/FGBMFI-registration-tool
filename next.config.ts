import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // These packages use Node APIs / workers and must not be bundled for the server.
  serverExternalPackages: ["pdfjs-dist", "pg", "cloudinary", "pdf-to-printer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
