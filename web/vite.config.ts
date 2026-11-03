/// <reference types="vitest/config" />
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const vendorNomi = fileURLToPath(new URL("../vendor/nomi", import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.ico",
        "icon.svg",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        name: "Nomifier",
        short_name: "Nomifier",
        description: "Live AR scoring of OTC medicines in the camera.",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        theme_color: "#000000",
        background_color: "#000000",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,wasm,json}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024, // zxing wasm
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/ws\//, /^\/media\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/data/") &&
              url.pathname.endsWith(".json"),
            handler: "NetworkFirst",
            options: { cacheName: "nomifier-data", networkTimeoutSeconds: 3 },
          },
        ],
      },
      devOptions: { enabled: true, navigateFallbackAllowlist: [/^\/$/] },
    }),
  ],
  resolve: { alias: { "@nomi": vendorNomi } },
  server: {
    host: true,
    allowedHosts: [".ts.net"], // iPhone dev through `tailscale serve --bg 5173`
    fs: { allow: [".."] }, // vendor/nomi lives outside web/
  },
  test: { environment: "node" },
});
