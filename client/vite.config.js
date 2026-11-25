import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite (5173) reenvia /api y /health al backend (3000):
// el navegador ve un solo origen, igual que en produccion.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/health': 'http://localhost:3000' },
  },
  build: { sourcemap: false },
});
