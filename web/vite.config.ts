import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // "@/..." means "src/..." (mirrored in tsconfig.json and tsconfig.app.json)
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // The backend's CORS allows only http://localhost:5173 by default,
    // so the dev server must never move to another port.
    port: 5173,
    strictPort: true,
  },
})
