/**
 * The repo lint config, assembled from the kit factory plus this repo's deltas.
 *
 * `defineRepoLintConfig` (from `@rexezuge/tooling`) owns the plugin set, the
 * family's layered boundary table and the dynamic-`import()` guard generated
 * from that table. The one delta this repo adds is the React layer: the kit
 * stays plugin-free, so `eslint-plugin-react-hooks` is installed here and
 * applied to the SPA.
 */
import { defineRepoLintConfig } from '@rexezuge/tooling/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...defineRepoLintConfig({
    scope: '@totp-generator',
    tsconfigRootDir: import.meta.dirname,
    // The web suite writes its report to the kit's default directory, which the
    // factory's ignore table does not name (it lists the `coverage-web` several
    // repos configure). The HTML report ships `sorter.js` and friends, and a
    // generated file linted is a generated file reported on.
    extraIgnores: ['coverage-spa/**'],
  }),
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs['recommended-latest'].rules,
  },
];
