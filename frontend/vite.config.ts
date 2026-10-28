import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      // '/research' is both the API prefix and an app route: browser page loads stay with the SPA.
      '/research': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        bypass: req => (req.headers.accept?.includes('text/html') ? '/index.html' : undefined),
      },
    },
  },
})
