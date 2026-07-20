import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/generate-totp': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/docs': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/openapi.json': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
