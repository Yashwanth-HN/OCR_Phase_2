import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev server proxies /api/* to your backend (the VS Code project that serves the model),
// stripping the /api prefix. Change DEV_PROXY_TARGET or the rewrite to match your server.
const DEV_PROXY_TARGET = process.env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // Regex key: only /api/... is proxied, so the in-app /api docs page still loads on refresh.
      '^/api/.*': {
        target: DEV_PROXY_TARGET,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\//, '/'),
      },
    },
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
