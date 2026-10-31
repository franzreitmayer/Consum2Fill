import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: {
    // Reachable from a smartphone in the same network
    host: true,
    proxy: {
      "/api": `http://localhost:${process.env.PORT ?? 3001}`,
    },
  },
  test: {
    environment: "jsdom",
  },
});
