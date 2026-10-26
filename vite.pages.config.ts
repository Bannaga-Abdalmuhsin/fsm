import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const root = fileURLToPath(new URL(".", import.meta.url));
export default defineConfig({
  root: resolve(root, "preview"),
  base: "/fsm/",
  publicDir: resolve(root, "preview/public"),
  plugins: [tailwindcss()],
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: "@/lib/pmr-actions",
        replacement: resolve(root, "preview/actions.tsx"),
      },
      {
        find: "@/lib/pmr-offline",
        replacement: resolve(root, "preview/offline.ts"),
      },
      {
        find: "@/lib/pmr-photo",
        replacement: resolve(root, "preview/photo.ts"),
      },
      {
        find: "@/components/pmr/Camera",
        replacement: resolve(root, "preview/Camera.tsx"),
      },
      { find: "@", replacement: resolve(root, "app") },
    ],
  },
  build: {
    outDir: resolve(root, "docs"),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
