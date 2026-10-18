#!/usr/bin/env tsx

/**
 * Materializes `wrangler.jsonc` and provisions what it refers to.
 *
 * The five ordered calls are `@rexezuge/tooling`'s, converged from the other
 * repos' copies. The entrypoint stays so `pnpm run prepare-config` and the
 * deploy job keep naming a path of this repo's own.
 *
 * Unlike the repos with bindings, this one passes nothing to
 * `provisionWranglerResources`: the TOTP API owns no D1 database, KV namespace
 * or secret store, and the explicit empty map is the statement of that fact —
 * omitting the argument would silently provision the kit's example cache
 * namespace instead.
 */
import {
  applyTopLevelPatch,
  applyVarsPatch,
  ensureMinimumConfigVersion,
  prepareConfigFile,
} from '@rexezuge/tooling/src/scripts/wrangler-config/patches';
import { provisionWranglerResources } from '@rexezuge/tooling/src/scripts/wrangler-config/resources';

prepareConfigFile();
ensureMinimumConfigVersion();
applyTopLevelPatch();
applyVarsPatch();
provisionWranglerResources({});
console.log('Wrangler configuration is ready.');
