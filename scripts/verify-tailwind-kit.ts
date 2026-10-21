#!/usr/bin/env tsx
/**
 * Fail when the SDK kit's Tailwind classes are missing from the built SPA.
 *
 * The kit's components are class-based, and their class names live in
 * `node_modules/@rexezuge/web/dist/*.js`. Tailwind's automatic source detection
 * skips `node_modules`, so unless `apps/web/src/globals.css` declares an
 * `@source` for the package, the build compiles none of those classes — and it
 * compiles *successfully*. The page renders, this repo's own classes still
 * apply, and every kit component is unstyled: cards lose their background,
 * border, radius and padding, buttons lose their shape, inputs lose their
 * borders. Nothing in the build log says so.
 *
 * This check reads the built CSS and asserts that a set of utilities the kit
 * alone contributes are present. The canaries are deliberately chosen from
 * classes that appear in `@rexezuge/web` and nowhere in `apps/web/src`, so the
 * app's own stylesheet cannot satisfy them on its own.
 *
 * **The build is a precondition of this check, not a convenience.** `dist/` is
 * gitignored and only `pnpm run build` writes it, so verifying without
 * building cannot pass — and it fails with precisely the message that says so,
 * which is the check working rather than the check being wrong.
 *
 * Usage, from the repo root:
 *
 * ```bash
 * pnpm exec tsx scripts/verify-tailwind-kit.ts            # defaults to ./ as root
 * pnpm exec tsx scripts/verify-tailwind-kit.ts /path/to/repo
 * ```
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The repository root, derived from this file rather than from `process.cwd()`.
 *
 * Two levels up, because this file sits in `scripts/`. Deriving it means the
 * gate reads the same tree whatever directory it is invoked from — which is
 * the difference between a gate and a gate that passes because nobody ran it
 * from the right place.
 */
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * One utility that only the kit can contribute, and the component it comes from.
 *
 * The comment names the source because the class name alone is not enough to
 * tell a reader why the class is a canary: `p-5` and `text-lg` are ordinary
 * utilities that would be trivial to use in this repo's own markup, and a
 * future reader who adds one of them to a component would silently weaken the
 * check.
 */
interface Canary {
  /** The Tailwind class, unescaped — the form it appears in the kit's source. */
  readonly className: string;
  /** The component whose class list contributes it. */
  readonly component: string;
}

/**
 * The utilities the kit contributes and this repo does not.
 *
 * `bg-[var(--color-surface-1)]` is the sharpest of them: the app's own
 * stylesheet names that variable in a comment and in the `@theme` block, but
 * never uses it as a utility, so the selector's presence can only come from
 * the kit's `Card`.
 */
const CANARIES: readonly Canary[] = [
  { className: 'bg-[var(--color-surface-1)]', component: 'Card' },
  { className: 'rounded-xl', component: 'Card' },
  { className: 'p-5', component: 'Card' },
  { className: 'text-lg', component: 'CardTitle' },
  { className: 'mb-4', component: 'CardHeader' },
  { className: 'max-w-2xl', component: 'AppPage (narrow)' },
  { className: 'inline-flex', component: 'Button / Badge' },
  { className: 'transition-colors', component: 'Button / Input' },
  { className: 'duration-150', component: 'Button / Input' },
  { className: 'disabled:opacity-50', component: 'Button' },
  { className: 'placeholder:text-[var(--color-text-muted)]', component: 'Input' },
  { className: 'disabled:opacity-60', component: 'Input' },
];

/**
 * Escape a class name the way a CSS selector has to.
 *
 * Every character that is not alphanumeric, `_` or `-` is escaped with a
 * backslash, which is what Tailwind emits: `bg-[var(--color-surface-1)]` is
 * written `.bg-\[var\(--color-surface-1\)\]` in the stylesheet. The rule is
 * applied to the whole name rather than to a hand-written list of characters,
 * because the list would have to grow with the canaries.
 */
function escapeSelector(className: string): string {
  return className.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character}`);
}

/**
 * Whether the stylesheet emits a utility for this class.
 *
 * The match is a plain substring search rather than a regular expression,
 * because the escaped selector is already CSS text — and CSS text contains
 * backslashes that a regular expression would consume as its own escapes.
 * `\[` in the stylesheet is a backslash followed by a bracket, and a
 * pattern built from that string matches a bare bracket instead of the two
 * characters the stylesheet actually holds.
 *
 * The character after the match ends the selector: a class name continues
 * with word characters, and anything else — `{`, `,`, `:`, whitespace — ends
 * it. That is what keeps `.p-5` from being satisfied by a `.p-50`.
 */
function hasUtility(css: string, className: string): boolean {
  const selector = `.${escapeSelector(className)}`;

  for (let index = css.indexOf(selector); index !== -1; index = css.indexOf(selector, index + 1)) {
    const next = css.charAt(index + selector.length);
    if (next === '' || !/[a-zA-Z0-9_-]/.test(next)) return true;
  }

  return false;
}

/**
 * Every stylesheet the SPA build emitted, concatenated.
 *
 * The bundle's file names are content-hashed, so there is no single file to
 * name, and a future split of the CSS would change the count rather than
 * break the check. Reading them all is the shape that survives that.
 */
function readBuiltCss(distDirectory: string): string | undefined {
  const assetsDirectory = path.join(distDirectory, 'assets');
  if (!existsSync(assetsDirectory)) return undefined;

  const stylesheets = readdirSync(assetsDirectory)
    .filter((name) => name.endsWith('.css'))
    .sort();

  if (stylesheets.length === 0) return undefined;

  return stylesheets.map((name) => readFileSync(path.join(assetsDirectory, name), 'utf8')).join('\n');
}

const root = process.argv[2] === undefined ? REPOSITORY_ROOT : path.resolve(process.argv[2]);
const distDirectory = path.join(root, 'apps', 'web', 'dist');
const css = readBuiltCss(distDirectory);

if (css === undefined) {
  console.error('Tailwind kit check failed:');
  console.error(`  - no stylesheet found in ${path.join(distDirectory, 'assets')}.`);
  console.error('    The build is a precondition of this check: run `pnpm run build` first.');
  process.exit(1);
}

const missing = CANARIES.filter((canary) => !hasUtility(css, canary.className));

if (missing.length > 0) {
  console.error('Tailwind kit check failed:');
  for (const canary of missing) {
    console.error(`  - missing .${canary.className} (from @rexezuge/web's ${canary.component})`);
  }
  console.error('');
  console.error("    @rexezuge/web's components are class-based, and Tailwind never scans");
  console.error('    node_modules, so their classes are only compiled when the stylesheet');
  console.error('    declares an @source for the package:');
  console.error("      @source '../node_modules/@rexezuge/web/dist';");
  console.error('    in apps/web/src/globals.css.');
  process.exit(1);
}

console.log(`Tailwind kit check passed (${CANARIES.length} kit utilities present in ${path.join(distDirectory, 'assets')}).`);
