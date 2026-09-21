import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared')
    }
  },
  build: {
    outDir: '../../build/renderer',
    emptyOutDir: true,
    sourcemap: false,
    target: 'chrome136',
    chunkSizeWarningLimit: 900
  },
  server: { port: 5173, strictPort: true }
});
