import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:3000' } },
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    outDir: 'dist',
    rollupOptions: { output: { entryFileNames: 'scorelens.js' } },
  },
});
