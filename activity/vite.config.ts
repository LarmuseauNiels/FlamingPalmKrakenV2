import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths so the same build works whether Discord serves it from
  // /.proxy/activity/ (inside the client) or the API serves it from /activity/
  // (when you open it in a browser to debug).
  base: "./",
  server: {
    // `vite dev` behind a Discord tunnel: the client loads the app from
    // <client_id>.discordsays.com, so the dev server must accept that host.
    allowedHosts: [".discordsays.com"],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
