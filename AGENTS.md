# AGENTS.md - TOTP-Generator

## Project Structure

This is a dual-package monorepo:
- **Root**: Cloudflare Worker backend (Hono + Chanfana + Zod + OTPLib)
- **`app/`**: React frontend (Vite + TailwindCSS v4 + React 19)

## Key Commands

```bash
# Generate Cloudflare types (after wrangler.jsonc exists)
npm run cf-typegen

# Build frontend only
npm run buildApp

# Full build for deployment
npm run predeploy

# Deploy to Cloudflare (requires wrangler.jsonc with secrets)
npm run deploy
```

**Frontend commands** (in `app/` directory):
```bash
cd app/
npm run build        # Build for development
npm run release     # Build for production (clean + build)
npm run prettier    # Format code
npm run lint        # Lint and fix
```

## Important Configuration

- **wrangler.jsonc**: Not committed (in `.gitignore`). Template at `wrangler.jsonc.template`. Secrets are stored in GitHub Actions vars/secrets and dumped at deploy time.
- **wrangler.pages.jsonc**: Not committed (in `.gitignore`). Template at `wrangler.pages.jsonc.template`. For Pages deployment with service binding.
- **Frontend env**: No longer used. `VITE_OPTIONAL_BACKEND_URL` has been removed in favor of the Pages Function proxy pattern.

## Architecture Notes

- **Backend entry**: `src/index.ts` - Hono app with CORS, OpenAPI docs at `/docs`
- **API endpoint**: `/generate-totp` with query params: `key`, `digits`, `period`, `algorithm`, `timeOffset`
- **Frontend**: Vite + React 19 + TailwindCSS v4. Built to `app/dist/`, served by Worker or Pages.
- **Pages Function proxy**: `functions/[[path]].ts` proxies `/generate-totp`, `/docs`, `/openapi.json` to the Worker via service binding `API_WORKER` — no external HTTP calls.
- **Pages routing**: `app/public/_routes.json` controls which paths hit the function vs. served directly.

## CI/CD

- **Two deploy workflows**: `continuous-deployment.yml` (contains `deploy-worker` and `deploy-pages` jobs)
- Both trigger on CI completion or manual dispatch
- Fork repos deploy to Cloudflare; main repo skips deploy (conditional: `if: ${{ github.repository != 'Rexezuge-CloudflareWorkers/TOTP-Generator' }}`)
- **Node version**: 24 (used in CI and locally)
- **Pages deployment**: Uses `wrangler.pages.jsonc` (generated from template or `WRANGLER_PAGES_JSONC` var) for service binding configuration. The `API_WORKER` binding connects Pages to the Worker.

## TypeScript Configs

- Root `tsconfig.json`: For backend (`src/`), excludes `app/`
- `app/tsconfig.json`: Project references (`tsconfig.app.json`, `tsconfig.node.json`)

## Commit Policy

Always commit changes after completing work unless explicitly told not to.

## Git Commit Messages

Format: `<TYPE>[optional scope]: <description>`

- Type in UPPERCASE: `FIX`, `FEAT`, `DOCS`, `STYLE`, `REFACTOR`, `TEST`, `BUILD`, `CHORE`, `CI`, `PERF`.
- Scope in lowercase: `FEAT(runtime): Add Scheduled Job State`.
- Description: Title Case words — `DOCS: Latest Agents Context Reflection`.
- When committing from `main`, first create a branch: `type/description` or `type/scope/description` in kebab-case (e.g. `feat/bootstrap/bootstrap-jqanywhere-v0.1-framework`).
- Always include a Markdown body separated from the subject by a blank line.
- Breaking changes: `!` after type/scope, or `BREAKING CHANGE: <description>` footer.

```text
<TYPE>[optional scope]: <description>

[Markdown body]

[optional footers]
```
