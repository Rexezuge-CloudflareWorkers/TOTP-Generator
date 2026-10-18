import react from '@vitejs/plugin-react';
import { defineWebVitestConfig } from '@rexezuge/tooling/vitest-web';

/**
 * The SPA suite: jsdom, React, and its own coverage directory.
 *
 * The kit factory owns the alias table and the `@rexezuge/*` inlining; this
 * repo supplies the plugin, the jsdom setup file, and the floors measured by
 * `pnpm run test:web:coverage`.
 *
 * `main.tsx` is excluded for the same reason the unit config excludes barrel
 * entry files (`index.ts`): it is the entry module, and its whole body hands the
 * document's root element to `createRoot`. A test that imported it would be
 * asserting React mounts, not this repo's code — the components it mounts are
 * covered through `App`.
 */
export default defineWebVitestConfig({
  scope: '@totp-generator',
  plugins: [react()],
  root: new URL('.', import.meta.url).href,
  setupFiles: ['test/web/setup.ts'],
  coverageExclude: ['apps/web/src/main.tsx'],
  thresholds: {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
});
