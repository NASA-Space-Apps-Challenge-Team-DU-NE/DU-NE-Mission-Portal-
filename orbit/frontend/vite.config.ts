import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 1800 },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
