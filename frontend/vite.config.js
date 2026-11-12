import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The dev server proxies /api to the Express backend so the browser sees one origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Fail loudly instead of silently moving to another port: the backend only accepts
    // requests from the origin listed in CLIENT_ORIGIN (default http://localhost:5173).
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
});
