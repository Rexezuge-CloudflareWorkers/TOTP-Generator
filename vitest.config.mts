import { fileURLToPath } from 'node:url';
import { defineUnitVitestConfig } from '@rexezuge/tooling/vitest';

/**
 * The unit suite: resolver and coverage floors.
 *
 * The alias table, the `cloudflare:*` mocks and the inlining that keeps
 * `@rexezuge/*` inside Vite's pipeline all come from the kit factory, derived
 * from `scope` and this repo's package list. Two entries stay local: the API
 * app is reachable by package name because the factory only aliases a
 * `packages/` layout plus `apps/background`, and the coverage floors are this
 * repo's own measurement.
 */
export default defineUnitVitestConfig({
  scope: '@totp-generator',
  aliases: [{ find: '@totp-generator/api', replacement: fileURLToPath(new URL('apps/api/src', import.meta.url)) }],
  root: new URL('.', import.meta.url).href,
  coverageInclude: ['apps/api/src/**/*.ts'],
  /**
   * The measured actuals from `pnpm run test:coverage`: the resolver, both
   * routes, the limiter wiring, the 404 branch and the 5xx boundary all have a
   * test, so the floor is the measurement, not a discount on it.
   */
  thresholds: {
    statements: 100,
    branches: 100,
    functions: 100,
    lines: 100,
  },
});
