import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
    // 開発時: /api と /health を FastAPI (8000番) へ転送する
    proxy: {
      '/api':    'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
});
