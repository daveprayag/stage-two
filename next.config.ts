import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The vendored rule engine (src/engine/core) uses ESM-style ".js" import specifiers for ".ts" files.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
