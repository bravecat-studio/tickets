import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH || '/',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    fs: { allow: [repoRoot] },
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@sms-config': path.join(repoRoot, 'sms.config.json'),
    },
  },
});
