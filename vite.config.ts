import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Lightning CSS drops unprefixed backdrop-filter when the -webkit- prefix is also present.
  // https://github.com/vitejs/vite/issues/22649
  build: {
    cssMinify: 'esbuild',
  },
  optimizeDeps: {
    include: ['pmtiles', '@protomaps/basemaps'],
    exclude: ['maplibre-gl'],
  },
})
