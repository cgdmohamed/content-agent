import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dev server and `vite preview` (used by the end-to-end tests) both forward /api to the API.
const apiProxy = {
  "/api": {
    target: process.env.API_PROXY_TARGET ?? "http://localhost:3000",
    changeOrigin: true
  }
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy
  },
  preview: {
    port: 4173,
    proxy: apiProxy
  }
});
