# TOTP-Generator

A web-based TOTP (Time-based One-Time Password) generator: a Cloudflare Worker API and a React SPA. The worker serves the SPA from its assets binding; the same SPA also deploys to Cloudflare Pages, where a Function proxies the API paths to the worker over a service binding.

Live demo: https://totp-generator.rexezuge.com/

## API

### `GET /generate-totp`

```
GET /generate-totp?key=YOUR_SECRET_KEY&digits=6&period=30&algorithm=SHA-1&timeOffset=0
```

| Parameter    | Description                                    | Default |
| ------------ | ---------------------------------------------- | ------- |
| `key`        | Secret key (required, Base32, min 16)          | -       |
| `digits`     | Number of digits (6-8)                         | 6       |
| `period`     | Code validity in seconds (10-60)               | 30      |
| `algorithm`  | Hash algorithm (`SHA-1`, `SHA-256`, `SHA-512`) | SHA-1   |
| `timeOffset` | Time offset in seconds (-3600 to 3600)         | 0       |

```json
{
  "otp": "123456",
  "remaining": 25
}
```

### `POST /generate-totp-batch`

One round trip for the codes either side of the current step:

```json
{
  "key": "YOUR_SECRET_KEY",
  "digits": 6,
  "period": 30,
  "algorithm": "SHA-1",
  "offsets": [-30, 0, 30]
}
```

`offsets` defaults to `[-30, 0, 30]`, takes 1-10 entries, each between -3600 and 3600 seconds.

```json
{
  "otps": [
    { "offset": -30, "otp": "111111" },
    { "offset": 0, "otp": "222222" },
    { "offset": 30, "otp": "333333" }
  ],
  "remaining": 25
}
```

`remaining` is the seconds left in the current step, counting down to 1 — never 0, so a client that renders `0` as "expired" cannot show a code as dead at the instant it is the only valid one.

Interactive documentation is served at `/docs`; the OpenAPI document at `/openapi.json`.

### Errors

Every error, at every status, is the shared envelope:

```json
{ "Exception": { "Type": "BadRequest", "Message": "Invalid request parameters: key: Key must be at least 16 characters long." } }
```

| Status | When                                                                                  | `Type`          |
| ------ | ------------------------------------------------------------------------------------- | --------------- |
| `400`  | a parameter is missing, malformed or out of range, or the key is not decodable Base32 | `BadRequest`    |
| `404`  | no route matches the request                                                          | `NotFound`      |
| `429`  | the rate limit was hit; `Retry-After` carries the seconds to wait                     | `RateLimited`   |
| `500`  | an unexpected failure; the message is masked and the detail is in the worker log      | `InternalError` |

A validation failure names **every** offending field in one sentence, joined by a space, so a caller that got two parameters wrong learns both from one round trip.

### Rate limit

60 requests per minute per client address (`CF-Connecting-IP`), per isolate. The 61st request in a window answers `429` with `Retry-After: 60`. The SPA debounces parameter edits by 500 ms, which keeps interactive use far below the budget.

### Compatibility notes

These behaviours changed with the layout refactor and the `@rexezuge/*` SDK adoption. They are breaking for an existing client:

- **The error envelope.** A `400` used to be `{ "error": "Invalid request parameters", "details": … }`, and a `500` Hono's plain-text `Internal Error`. Both now use `{ "Exception": { "Type", "Message" } }`.
- **An undecodable key is always `400`.** It used to be a `400` or a masked `500` depending on which words the otplib message happened to contain. The message is now `Unable to generate a TOTP code: <otplib's sentence>`.
- **`details` is gone.** Validation failures are the one-sentence form above.

## Repository Layout

- `apps/api/` — the worker: Hono + chanfana routes, otplib generation, rate limit and security headers
- `apps/web/` — the SPA: Vite + React 19 + TailwindCSS v4 with `@rexezuge/web` components
- `functions/[[path]].ts` — the Pages Function proxying `/generate-totp`, `/generate-totp-batch`, `/docs` and `/openapi.json` to the worker
- `test/` — both suites: `test/api` and `test/web`
- `scripts/prepare-wrangler-config.ts` — materialises `wrangler.jsonc` from its template

## Development

```bash
pnpm install              # installs the workspace and generates worker types
pnpm run dev              # worker dev server on :8787; the Vite dev server proxies the API paths to it
pnpm run checks           # typecheck, lint, format:check, god-files, both suites with coverage
pnpm run test:coverage    # API suite
pnpm run test:web:coverage # SPA suite
pnpm run build            # SPA → apps/web/dist
```

## Deployment

Worker (`wrangler.jsonc` is generated, never committed):

```bash
pnpm run deploy           # prepare-config + wrangler deploy
```

Pages:

```bash
pnpm run build
cp apps/web/wrangler.template.jsonc wrangler.jsonc   # pages_build_output_dir + API_WORKER binding
pnpm exec wrangler pages deploy apps/web/dist --project-name totp-generator-app
```

Both are what `.github/workflows/continuous-deployment.yml` runs after CI passes on `main`.

## License

MIT
