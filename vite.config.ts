/* eslint-disable @typescript-eslint/no-unused-vars */
import { defineConfig } from "vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*\/server\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*\/storage\/v1\/object\/public\/avatars\//,
            handler: "CacheFirst",
            options: {
              cacheName: "avatar-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 7 * 86400 },
            },
          }
        ]
      },
      manifest: false, // Su dung file manifest co san tai public/manifest.webmanifest
    }),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ["**/*.svg", "**/*.csv"],
});

