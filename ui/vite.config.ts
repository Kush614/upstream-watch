import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The TrueForge server owns sessions, approvals and the SSE stream.
      "/api": {
        target: process.env.TRUEFORGE_URL ?? "http://localhost:8790",
        changeOrigin: true,
      },
    },
  },
});
