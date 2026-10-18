import { NotFoundError, ServiceError } from '@rexezuge/errors';
import { BaseRoute, rateLimit, securityHeaders } from '@rexezuge/http';
import { AbstractEntrypointWorker, BASE_WORKER_MESSAGES } from '@rexezuge/runtime';
import { fromHono } from 'chanfana';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GenerateTOTPRoute } from './endpoints/api/get';
import { GenerateTOTPBatchRoute } from './endpoints/api/postBatch';

/**
 * The API's two routes.
 *
 * Both carry secret material — this is the only reason they exist — so both are
 * the `Cache-Control: no-store` surface.
 */
export const API_PATHS: readonly string[] = ['/generate-totp', '/generate-totp-batch'];

/**
 * One minute.
 */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Requests per window per client.
 *
 * The public surface had no budget at all; sixty is well above what a person
 * clicking around the SPA spends and well below what enumerating a key space
 * needs. The limiter is per-isolate — the honest limit is a shared budget that
 * Cloudflare's rate limiting rules can add later — but a per-isolate ceiling
 * still turns an unbounded surface into a bounded one.
 */
export const RATE_LIMIT_MAX_REQUESTS = 60;

export const RATE_LIMIT_KEY_PREFIX = 'totp-generator';

/**
 * Whether a pathname is one of the secret-bearing routes.
 *
 * Deliberately not `sensitivePaths(...)`: that helper normalises each prefix to
 * `<prefix>/` so it can match *subpaths*, and both of this API's routes are the
 * exact path — the helper would return `false` for the only paths that matter.
 */
export function isSensitivePath(pathname: string): boolean {
  return API_PATHS.includes(pathname);
}

export class TotpWorker extends AbstractEntrypointWorker {
  private readonly app: Hono;

  public constructor() {
    super();

    const app = new Hono();

    // Public API: the SPA runs from this origin on the worker deployment and
    // from a second one on Pages, so cross-origin callers keep working.
    app.use('*', cors());
    app.use('*', securityHeaders(isSensitivePath));
    app.use('*', rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX_REQUESTS, keyPrefix: RATE_LIMIT_KEY_PREFIX }));

    const openapi = fromHono(app, { docs_url: '/docs' });
    openapi.get('/generate-totp', GenerateTOTPRoute);
    openapi.post('/generate-totp-batch', GenerateTOTPBatchRoute);

    app.notFound((c) => BaseRoute.toErrorResponse(new NotFoundError('No route matches this request.'), c));

    // One boundary for every thrown value. Chanfana rethrows what a route
    // throws (`raiseOnError`), so a `BadRequestError` from validation and an
    // unexpected failure arrive here the same way; the mapper decides the
    // status and the envelope, and only a 5xx is logged — its message is masked
    // for the client, so the log is the only place it survives.
    app.onError((error, c) => {
      if (ServiceError.from(error).status >= 500) {
        this.reportUnhandled(BASE_WORKER_MESSAGES.fetch, error);
      }

      return BaseRoute.toErrorResponse(error, c);
    });

    this.app = app;
  }

  protected async onRequest(request: Request): Promise<Response> {
    return this.app.fetch(request);
  }

  protected async onScheduled(): Promise<void> {
    // This worker declares no cron triggers, so the platform never dispatches
    // here; the method exists because the base requires it, and an empty body
    // is the true statement about the schedule.
  }
}
