import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages and any static host.
export default defineConfig({
  base: './',
  css: { preprocessorOptions: { scss: { api: 'modern-compiler' } } },
  build: { outDir: 'dist', sourcemap: true },
});
