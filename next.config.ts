import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages.
 * NEXT_PUBLIC_BASE_PATH is set to "/<repo-name>" for project pages
 * (e.g. /TheReelWindyCity) and left empty for local development.
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  allowedDevOrigins: ["localhost", "127.0.0.1", "*.e2b.app"],
  serverExternalPackages: ["@xenova/transformers", "onnxruntime-node", "sharp"],
  turbopack: {
    resolveAlias: {
      sharp: "./src/lib/empty-module.ts",
      "onnxruntime-node": "./src/lib/empty-module.ts",
    },
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp: false,
      "onnxruntime-node": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      url: false,
    };
    return config;
  },
};

export default nextConfig;
