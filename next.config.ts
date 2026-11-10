import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Social preview cards read their fonts from disk at request time (the per-stock card is rendered on demand).
  outputFileTracingIncludes: { "/stock/[symbol]/opengraph-image": ["./src/assets/og/**"] },
  // The vendored rule engine (src/engine/core) uses ESM-style ".js" import specifiers for ".ts" files.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
