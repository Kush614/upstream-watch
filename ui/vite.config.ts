import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The TrueForge server owns sessions, approvals and the SSE stream.
      //
      // Default to the IPv6 loopback: `npx @truefoundry/trueforge` binds [::1]:8790, and
      // "localhost" resolves to 127.0.0.1 here — where nothing is listening. Vite then
      // falls through to its SPA handler and answers every /api request with index.html,
      // so the app sees HTML instead of JSON and sits on "local feed" forever, with a 200
      // on every request and nothing in the log.
      "/api": {
        target: process.env.TRUEFORGE_URL ?? "http://[::1]:8790",
        changeOrigin: true,
        // Surface a dead upstream instead of quietly serving the app shell.
        configure: (proxy) => {
          proxy.on("error", (err) => {
            console.error(`[proxy] TrueForge unreachable: ${err.message}`);
          });
        },
      },
    },
  },
});
