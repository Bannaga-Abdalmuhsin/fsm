import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "npm:jpeg-js@0.4.4": path.resolve(__dirname,"node_modules/jpeg-js/index.js"),
      "npm:pngjs@7.0.0": path.resolve(__dirname,"node_modules/pngjs/lib/png.js"),
      "npm:exifr@7.1.3": path.resolve(__dirname,"node_modules/exifr/dist/full.esm.mjs"),
      "@": path.resolve(__dirname, "./app"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  test: {
    exclude: [
      "**/node_modules/**",
      "**/.git/**",
      "**/dist/**",
      "**/.react-router/**",
    ],
  },
});
