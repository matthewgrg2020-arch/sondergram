import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: "./",
  plugins: [viteReact(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(root, "src"),
      "@tanstack/react-start": resolve(root, "src/lib/player/start-stub.ts"),
    },
  },
  publicDir: "public",
  build: {
    outDir: "dist-apk",
    emptyOutDir: true,
    assetsDir: "assets",
    target: ["es2020", "chrome80"],
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(root, "apk.html"),
    },
  },
});