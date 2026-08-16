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

## Root commands

- Start Angular: `npm run start:front`
- Start NestJS in watch mode: `npm run start:back`
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
4. Confirm generated dependencies before installing more packages. The standard Nest scaffold already includes Jest, `ts-jest`, `@types/jest`, `@nestjs/testing`, and Supertest.
5. Add configuration and validation packages only when the application uses them.
6. Add a health endpoint and cover it with both unit and end-to-end tests.
7. Run build, lint, unit tests, and end-to-end tests before reporting completion.

## TypeScript and Jest lessons

### Jest globals missing in editor

If VS Code reports that `describe`, `it`, `beforeEach`, or `expect` cannot be found, first verify that `jest` and `@types/jest` are installed. Do not reinstall them blindly.

End-to-end tests under `Backend/test/` need a TypeScript project that explicitly loads Jest globals. Preserve `Backend/test/tsconfig.json` with these essential settings:

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "..",
    "types": ["jest", "node"]
  },
  "include": ["./**/*.ts", "../src/**/*.ts"]
}
```

The `rootDir` must be `..` because end-to-end tests import application files from both `Backend/test` and `Backend/src`. Without it, editors may report TS6059 for source files outside `Backend/test`.

After creating or moving a `tsconfig`, VS Code may retain its previous in-memory project graph. Only suggest **TypeScript: Restart TS Server** if correct configuration is present but stale diagnostics remain. A restart is a cache refresh, not a dependency fix.

### TypeScript compatibility

- Do not add `baseUrl` merely to support path aliases. It is deprecated in TypeScript 6 and planned for removal in TypeScript 7.
- If aliases are needed, use explicit `paths` entries with paths relative to the `tsconfig` file and verify them with the installed TypeScript version.
- Do not hide migration warnings with `ignoreDeprecations` when the deprecated option can safely be removed.
- With `isolatedModules` and decorator metadata enabled, import types used in decorated signatures with `import type`.

## Testing expectations

- Unit tests should exercise controllers/services without opening a network port.
- End-to-end tests should create the real `AppModule`, call `configureApp(app)`, and exercise versioned HTTP routes through Supertest.
- Do not duplicate global prefix, validation, or CORS configuration inside tests.
- Type-check the end-to-end project when changing its configuration:

```powershell
.\Backend\node_modules\.bin\tsc.cmd --project Backend\test\tsconfig.json
```

- On non-Windows systems, use the equivalent local TypeScript executable.

## Completion checklist

For backend changes, run the relevant subset and report exact results:

```bash
npm run backend:build
npm run backend:lint
npm run backend:test
npm run backend:test:e2e
```

Also run `git diff --check`. Do not claim the changes are committed or pushed unless Git confirms it.
