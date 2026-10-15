import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  build: {
    target: 'es2020', modulePreload: false, assetsInlineLimit: 0, sourcemap: true,
    rollupOptions: {
      input: { index: 'src/index.ts', cdn: 'src/cdn.ts', storefront: 'src/storefront-entry.ts' },
      preserveEntrySignatures: 'strict',
      output: { format: 'es', entryFileNames: '[name].js', chunkFileNames: '[name]-[hash].js', assetFileNames: '[name]-[hash][extname]' },
    },
  },
});
