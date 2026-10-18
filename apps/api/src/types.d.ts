/**
 * The worker's bindings.
 *
 * `wrangler types` generates `CloudflareEnv` from the template (`pnpm run
 * typegen`, wired into `postinstall`), while the kit's bases and this repo's
 * tests refer to the binding interface as `Env` — the one-line bridge every
 * repo in the family carries.
 *
 * The interface is empty because the TOTP API owns no bindings at all: no KV,
 * no D1, no queues, no vars.
 */
type Env = CloudflareEnv;
