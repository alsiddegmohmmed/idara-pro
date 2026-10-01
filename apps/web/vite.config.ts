import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    // Allow the Cloudflare Quick Tunnel hostname (random *.trycloudflare.com) to reach the dev server.
    allowedHosts: [".trycloudflare.com"],
    // Dev only: forward API calls to the Nest API so the browser sees one origin
    // (the refresh cookie is SameSite=Strict and scoped to /api/v1/auth).
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
});
