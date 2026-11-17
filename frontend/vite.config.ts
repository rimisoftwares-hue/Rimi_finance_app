import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
    },
  },
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3003,
    strictPort: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:3004',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  preview: {
    host: '0.0.0.0',
    port: 3003,
    strictPort: true,
    cors: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
