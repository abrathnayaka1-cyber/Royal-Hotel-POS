import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      // Allow proxied preview hosts (Arena / Codespaces / tunnels).
      // Without this vite replies "Blocked request. This host is not allowed."
      allowedHosts: true as const,
      // Never watch the runtime JSON database — every sale/booking write would
      // otherwise trigger a full page reload for all open POS stations.
      watch: {
        ignored: ['**/.arena-data/**', '**/data/**'],
      },
      // Proxy not needed because server.ts uses vite middleware, but keep for standalone vite dev
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      allowedHosts: true as const,
    },
  };
});
