import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/DurHack26",
  images: {
    unoptimized: true,
  },
  // This loader implements the standard webpack loader API too. Without it,
  // --webpack serves Tailwind's source CSS without generating utility classes.
  webpack(config) {
    config.module.rules.push({ rules: [{
      test: /\.css$/,
      enforce: "pre",
      use: [{ loader: "@tailwindcss/turbopack", options: { base: process.cwd() } }],
    }] });
    return config;
  },
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
