import { createPagesProxy } from '@rexezuge/tooling/functions/pages-proxy';

/**
 * Every request Pages cannot answer with a static file — the four API paths in
 * `public/_routes.json` — goes to the `totp-generator` worker over the
 * `API_WORKER` service binding. No external HTTP call and no origin
 * configuration: the binding is resolved by the platform.
 */
export const onRequest = createPagesProxy();
