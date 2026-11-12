import { createRequire } from "module";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // These packages use Node APIs / workers and must not be bundled for the server.
  serverExternalPackages: ["pdfjs-dist", "@neondatabase/serverless", "ws", "cloudinary", "pdf-to-printer"],
  webpack(config) {
    // Allow Webpack to resolve font files referenced by CSS in node_modules
    // (e.g. @fontsource packages that use relative ./files/ URLs).
    config.module.rules.push({
      test: /\.(woff|woff2|eot|ttf|otf)$/i,
      type: "asset/resource",
    });

    // Force the CJS build of @tanstack/react-table so Webpack doesn't pick up
    // the ESM entry (index.mjs) whose bare '@tanstack/table-core' import it
    // cannot resolve in this configuration.
    // createRequire uses CJS conditions (default/require), so this resolves to
    // build/lib/index.js rather than the ESM index.mjs. Created lazily here (not at
    // module scope) because a top-level `require` binding gets lost when Next
    // recompiles this config file on a hot restart.
    const require = createRequire(import.meta.url);
    config.resolve.alias = {
      ...config.resolve.alias,
      "@tanstack/react-table": require.resolve("@tanstack/react-table"),
    };

    return config;
  },
};

export default nextConfig;
