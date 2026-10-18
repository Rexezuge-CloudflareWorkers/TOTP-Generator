import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineWebViteConfig } from '@rexezuge/tooling/vite';

/**
 * The SPA build.
 *
 * The plugin list and the dev-server proxy come from the kit factory. There is
 * no `spaShell` target: this worker does not embed the shell in its source, it
 * serves `dist/` through the assets binding and Pages serves it as static
 * files, so the SPA's output is never read back by the API.
 */
export default defineWebViteConfig({
  plugins: [react(), tailwindcss()],
  proxy: {
    '/generate-totp': { target: 'http://localhost:8787', changeOrigin: true },
    '/generate-totp-batch': { target: 'http://localhost:8787', changeOrigin: true },
    '/docs': { target: 'http://localhost:8787', changeOrigin: true },
    '/openapi.json': { target: 'http://localhost:8787', changeOrigin: true },
  },
});
