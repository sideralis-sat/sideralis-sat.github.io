import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH permite publicar en un subdirectorio (p. ej. GitHub Pages: /orbita/)
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  worker: { format: 'es' },
  // three.js + R3F ocupan ~1 MB (~320 kB comprimido); es lo esperable en una app 3D
  build: { chunkSizeWarningLimit: 1800 },
})
