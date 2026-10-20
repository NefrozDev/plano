# AGENTS.md

## Purpose

This repository is a learning and technical-interview showcase. When changing backend code, explain the relevant NestJS and TypeScript concepts in plain language, including why a change is needed and how it is verified.

These instructions are also intended to be reusable when starting another Angular and NestJS repository.

## Repository boundaries

- `Frontend/` contains the Angular application.
- `Backend/` contains the NestJS REST API.
- `Common/` is reserved for framework-independent contracts shared by both applications.
- Frontend and Backend may depend on Common. Common must not depend on either application.
- Keep one Git repository at the root. When scaffolding nested applications, always disable creation of nested `.git` directories.
- Install dependencies locally in the relevant package. Do not require global Angular or Nest CLI installations.
- Both apps run on Node 24 (`.nvmrc`, CI, Dockerfiles; keep them in sync). Angular 22 needs `^24.15` and TypeScript 6.0. The frontend still runs on Zone.js through `provideZoneChangeDetection()` in `app.config.ts`; going zoneless is a deliberate future change, not a side effect of an upgrade.

## Root commands

- Start Angular: `npm run start:front`
- Start NestJS in watch mode: `npm run start:back`
- Start or stop the local PostgreSQL (Docker): `npm run db:start`, `npm run db:stop`
- Build NestJS: `npm run backend:build`
- Lint NestJS: `npm run backend:lint`
- Run NestJS unit tests: `npm run backend:test`
- Run NestJS end-to-end tests: `npm run backend:test:e2e`

Keep these root commands working when package scripts change.

## NestJS architecture

- Use strict TypeScript settings for new NestJS projects.
- Organize business capabilities as feature modules under `Backend/src/`.
- Controllers handle HTTP transport concerns.
- Injectable services/providers contain application logic.
- Modules declare and connect controllers, providers, imports, and exports.
- Keep the root `AppModule` focused on composing configuration and feature modules.
- Apply shared HTTP setup through `configureApp()` in `Backend/src/app.config.ts` so runtime and end-to-end tests use identical configuration.
- Keep the REST prefix at `/api/v1` unless a deliberate versioning change is requested.
- Keep the Angular development origin configurable through `FRONTEND_URL`; its local default is `http://localhost:4200`.
- Use a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted`, and `transform` enabled.
- Never commit `.env`. Maintain a safe `.env.example` containing names and non-secret defaults.

## Fresh NestJS scaffold checklist

When creating a new backend in an existing repository:

1. Use the Nest CLI through `npx`; do not install it globally.
2. Use strict mode, npm, and skip Git initialization.
3. Verify the target directory before scaffolding and preserve existing files.
4. Confirm generated dependencies before installing more packages. A CommonJS Nest scaffold still generates Jest; this repository uses Vitest (see Testing expectations), so replace it rather than adding a second runner. `@nestjs/testing` and Supertest are runner-agnostic.
5. Add configuration and validation packages only when the application uses them.
6. Add a health endpoint and cover it with both unit and end-to-end tests.
7. Run build, lint, unit tests, and end-to-end tests before reporting completion.

## TypeScript and test-runner lessons

### Test globals missing in editor

If VS Code reports that `describe`, `it`, `beforeEach`, `expect` or `vi` cannot be found, first verify that `vitest` is installed and that the relevant tsconfig lists `vitest/globals` in `types`. Do not reinstall packages blindly.

End-to-end tests under `Backend/test/` need a TypeScript project that explicitly loads the Vitest globals. Preserve `Backend/test/tsconfig.json` with these essential settings:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "../..",
    "types": ["node", "vitest/globals"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

The `rootDir` must be `../..` (the repository root) because end-to-end tests import files from `Backend/test` and `Backend/src`, and those import types from `Common/src`. Without it, editors may report TS6059 for files outside the declared root.

### Sharing types from Common with the backend

- The backend may only `import type` from `@plano/common`; ESLint enforces it. Common is compiled with the Angular app, not shipped with the API, and type imports disappear at build time.
- `Backend/tsconfig.json` sets `rootDir` to `..` so `Common/src` is part of the program. The build output is therefore `Backend/dist/Backend/src/main.js`: `nest-cli.json` (`entryFile`) and `start:prod` point there.
- Never resolve runtime paths with a fixed number of `..` from `__dirname`: the depth differs between `src` and `dist`. Resolve from the Backend package root instead (walk up to the nearest `package.json`).

After creating or moving a `tsconfig`, VS Code may retain its previous in-memory project graph. Only suggest **TypeScript: Restart TS Server** if correct configuration is present but stale diagnostics remain. A restart is a cache refresh, not a dependency fix.

### TypeScript compatibility

- Do not add `baseUrl` merely to support path aliases. It is deprecated in TypeScript 6 and planned for removal in TypeScript 7.
- If aliases are needed, use explicit `paths` entries with paths relative to the `tsconfig` file and verify them with the installed TypeScript version.
- Do not hide migration warnings with `ignoreDeprecations` when the deprecated option can safely be removed.
- With `isolatedModules` and decorator metadata enabled, import types used in decorated signatures with `import type`.

## Deployment

- Target: OVH VPS `57.129.169.235`, app served at `plano.synapseengineering.dev` (domain on Cloudflare, record kept DNS only so Mailcow's ACME client can validate it). The apex and `www` belong to the owner's portfolio on Vercel, which acts as the shell for their projects: never touch those DNS records.
- The same VPS (Ubuntu 26.04, 3.7 GB RAM) runs Mailcow for `mail.synapseengineering.dev`. Mailcow's nginx owns ports 80/443 and terminates HTTPS for Plano too (`deploy/mailcow-plano.conf`, domain in Mailcow's `ADDITIONAL_SAN`). Plano publishes no port and joins the Mailcow Docker network as `plano-web`. Never change the firewall, Mailcow ports or its certificate flow: a mistake breaks e-mail. Mailcow's `data/conf/nginx/` is mounted as `/etc/nginx/conf.d` (loaded via `*.conf`); always run `nginx -t` in `nginx-mailcow` before reloading.
- Memory is tight: keep `mem_limit` on every Plano service and never build images on the VPS.
- Flow: GitHub Actions (`.github/workflows/ci.yml`) lints and tests both apps, then, only on `main` and only if every check passes, pushes `ghcr.io/nefrozdev/plano-api` and `plano-web`; keep CI commands in sync with the package scripts; on the VPS, `git pull`, then `docker compose -f compose.prod.yaml pull && ... up -d`.
- Stack: Caddy (`Frontend/Dockerfile` + `deploy/Caddyfile`, plain HTTP) serves Angular and proxies `/api` to the `api` service; Postgres has no published port.
- Frontend and API share one origin, so `FRONTEND_URL` is `https://$DOMAIN` and CORS/origin checks need no changes. Keep it that way unless a separate API domain is deliberately introduced.
- Docker build context is the repository root for both images because they compile `Common/`. Keep `.dockerignore` excluding `node_modules`, `dist` and `.env`.
- The production `.env` exists only on the VPS (template: `.env.production.example`). Use hex passwords: the DB password is embedded in `DATABASE_URL`.
- Rate limiting (`@nestjs/throttler`, global guard, stricter `@Throttle` on login/register) keys on `req.ip`. That only works because `configureApp()` trusts private proxy hops and `deploy/Caddyfile` sets `trusted_proxies`; keep both, or every user shares one bucket. The store is in memory, which is fine only while the API runs as a single instance.

## Testing expectations

- Unit tests should exercise controllers/services without opening a network port.
- End-to-end tests should create the real `AppModule`, call `configureApp(app)`, and exercise versioned HTTP routes through Supertest.
- Do not duplicate global prefix, validation, or CORS configuration inside tests.
- Type-check the end-to-end project when changing its configuration:

```powershell
.\Backend\node_modules\.bin\tsc.cmd --project Backend\test\tsconfig.json
```

- On non-Windows systems, use the equivalent local TypeScript executable.
- Backend tests run with Vitest (`vitest.config.mts`, `vitest.config.e2e.mts`). Vitest compiles TypeScript with esbuild, which drops the decorator metadata Nest's dependency injection needs, so both configs compile through SWC (`unplugin-swc`). The e2e config spreads the unit one: `mergeConfig` would concatenate the `include` arrays and run both suites.
- Under Vitest the code runs as ES modules: `vi.spyOn` cannot replace a named import such as `scrypt` from `node:crypto`. Use `vi.mock()` with `importOriginal` instead (see `password.service.spec.ts`).
- Frontend unit tests run with Vitest in browser mode (headless Chromium through Playwright, `@angular/build:unit-test`), not jsdom: specs rely on `<dialog>.showModal()`, `navigator.clipboard` and real layout. Run `npx playwright install chromium` once per machine. Zone's `fakeAsync`/`tick` do not work under Vitest; use `vi.useFakeTimers()` and `vi.advanceTimersByTime()`.
- TypeScript 6 no longer loads every installed `@types/*` package: `types` defaults to `[]`. `Backend/tsconfig.json` lists `node` and `vitest/globals`; `tsconfig.build.json` narrows it to `node` so production code cannot use test globals.

## Completion checklist

For backend changes, run the relevant subset and report exact results:

```bash
npm run backend:build
npm run backend:lint
npm run backend:test
npm run backend:test:e2e
```

Also run `git diff --check`. Do not claim the changes are committed or pushed unless Git confirms it.

## Commits

- Agents may commit on their own once a logical change is complete and verified; pushing stays with the owner.
- Keep commits granular: one logical change each (for example infrastructure, backend feature, frontend follow-up), never a large mixed commit.
- Message format: `<Prefix>: <imperative summary>` with `Feat`, `Fix`, `Impr`, `Chore`, `Test` or `Docs`, plus a short body explaining why when it is not obvious.
