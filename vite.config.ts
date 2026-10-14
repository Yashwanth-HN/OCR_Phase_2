import { fileURLToPath, URL } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Dev server proxies /api/* to your backend (the VS Code project that serves the model),
  // stripping the /api prefix. Set VITE_DEV_PROXY_TARGET in .env.local (or the shell) to change it.
  // loadEnv is needed because Vite does not put .env* values into process.env for this file.
  const DEV_PROXY_TARGET =
    process.env.VITE_DEV_PROXY_TARGET ??
    loadEnv(mode, process.cwd(), '').VITE_DEV_PROXY_TARGET ??
    'http://localhost:8000';

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      proxy: {
        // Regex key: only /api/... is proxied (not a bare /api URL).
        '^/api/.*': {
          target: DEV_PROXY_TARGET,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api\//, '/'),
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
  };
});
