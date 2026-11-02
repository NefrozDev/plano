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

## Domain rules

- A user can belong to several groups (at most 20); every group route except create and join takes `:groupId`, and a group the caller is not in answers 404.
- "Contacts" are a user's friends plus the members of all their groups (`ContactsService`, `GET /contacts`). Anything that shares or invites (list members, event participants) must go through contacts, so unfriending or leaving a group revokes access.
- Friendships are mutual: one `friendships` row per pair (unique index on the unordered pair), accepted by the recipient. User search is a capped username prefix match that never returns e-mails.
- Profile pictures live in `users.avatar` (bytea, `select: false`). The type is read from the file's first bytes, never from the client. URLs carry `?v=avatarVersion` so they can be cached forever.
- Usernames can change (`PATCH /users/me`), with the registration rules and a 409 when taken in any case; `users/username.ts` holds the shared rules.
- Each member arranges lists for themselves: `list_preferences` (one row per user and list: `position`, `onHome`) orders their overview and pins lists to their home page (`GET /lists/home`). Never store such choices on the list itself: shared lists would change for everyone.
- Notifications are stored per user (`notifications`, `NotificationsService.notify()` after the commit, outside the write lock). The same kind on the same target joins an unread one (`count`). Losing access to a list or objective (`ListChangesService.removed()`, `ObjectiveChangesService` "lost"), or a friendship ending, deletes what was about it. The home page bell lists them; the agenda, lists and objectives tabs count their area; a screen calls `readNotificationsWhileOpen()` to read what is about its place. Anything new worth telling goes through `notify()`, never a client-side counter.
- Friend changes are pushed live once committed (`friend.requested`, `friend.accepted` with the other person's public profile, `friends.changed`). The app's `FriendNotificationsService` turns them into a toast; the counts are the notifications'.
- Objectives are trees (`objectives`, with `rootId` and `parentId`): one owner per tree, at most 10 levels and 500 objectives, because a whole tree is loaded per request. `ObjectiveTree` is the one place that computes progress and roles, without touching the database. Every write goes through `ObjectiveWriterService.change()`: permission, transaction, statuses settled from progress, then live events once committed. A parent's bar is the weighted average of its children; only a complete objective shows 100.
- An objective invitation (`objective_members`) reaches that objective and everything below it, nothing above, and the strongest role on the way up decides. `viewer` reads, `contributor` moves things forward, only the owner changes structure, settings and people. Going through contacts revokes access as for lists. Privacy is enforced in `ObjectiveViewService` and `ObjectiveChangesService`: above what was shared, people get names only (`breadcrumb[].id` and `parentId` are null), no progress, no other people, and events never carry an id they may not know. Any new field or event on objectives needs a test in the "leaks nothing" style (`objective-members.service.spec.ts`).
- Lists link to objectives (`lists.objectiveId`, one objective per list, `ObjectiveListsService`). Only the objective's owner links, and only lists they own; linking shares nothing, so `ObjectiveDetail.lists` holds only the lists the viewer can open (`ListAccessService.visibleTo()`). The `list` progress mode counts checked items of linked lists, except lists that delete checked items. A list change reaches objectives through `ListChangesService.objectiveListsChanged`, so lists never depend on objectives.
- Completing the open objective (own action or live update) raises `ObjectivesStore.celebration`; `ObjectiveCelebrationComponent` lets the owner restart (`POST /objectives/:id/restart`, top-level only: the period goes to its history, "Liste" mode lists are unchecked), archive or delete it. Every deletion goes through `ObjectiveRemovalService`, which asks whether the linked lists go too (`?deleteLists=true`; kept by default, counted by `linkedListCount` for the owner only).
- Recurring objectives restart lazily: there is no background job, `ObjectiveRecurrenceService.restartDue()` runs on the way to the screens, so any new way of reading objectives must call it. Only what is dated from `periodStart` counts, and days are the server's (UTC). Objective reminders are stored per person, but nothing sends them yet.
- A count or a habit is the app's tracker ("run twice a week"). On a top-level one, the form offers its pace (*Rythme*) under the target instead of the *Répéter* switch: both set `recurrence`, so never show the two together. A habit's days are capped by its period (7 a week). Its tab judges each period, as a daily rate would call 2 days out of 7 a failure.
- The browser used to hold objectives (`PlanoData.objectives.items`): `ObjectivesStore` imports them once, in batches under the 100 KB body limit. Their ids are derived from the local ones, so sending them twice creates them once. Display settings and recent searches stay in the browser.
- Terms of use and privacy policy: one text, `TermsContentComponent` (French, like the sign-up form), shown at `/terms` (public) and in the sign-up dialog. Bump `TERMS_UPDATED_ON` with any change. It states facts about the app (30-day session cookie, 30-minute reset links, no third-party trackers, OVHcloud hosting, Belgian law and APD): keep them true when the app changes. Acceptance is `users.termsAcceptedAt`, required by `RegisterDto.acceptedTerms`.
- Password recovery: `POST /auth/password-reset` answers 204 whatever the address; the link puts a single-use, 30-minute token in the URL fragment (never logged by proxies), stored as a SHA-256; confirming ends every session.

## Frontend i18n

- Transloco translates at runtime. `Frontend/src/i18n/fr.json` is the source language; `en`, `nl`, `es`, `de` and `it` must get every new key in the same change (each file is a lazy chunk with a hashed name).
- Templates use the `transloco` pipe; TypeScript uses `TranslocoService.translate()` at call time. Language names stay in their own language.
- The language follows the account (`users.locale`); before sign-in it is this browser's last choice, then the browser languages, then French.
- Every TestBed loads the French texts through the unit-test `providersFile` (`src/test-providers.ts`), so specs assert French strings.
- The lists and objectives screens are still written in French in their templates; only what is shared with the rest of the app (toasts, the tab bar) goes through Transloco.

## Frontend layout

- On wide screens the app is drawn inside a phone frame by `MobileShellLayoutComponent`. Every signed-in screen must be routed as a child of a shell route (`app.routes.ts`, `agenda.routes.ts`, `objectives.routes.ts`) or wrap itself in `app-auth-shell` (groups pages); a top-level route stretches across the whole window. `app.routes.spec.ts` pins the shell's children.

- Every face goes through `app-user-avatar` (or `app-avatar-stack`, which uses it): the picture when there is one, initials otherwise or if it fails to load. Never draw initials by hand, and have the API send `avatarVersion` with any person it names, or their picture will not show.

- A screen reached from several places (the settings) sets `[returnToPrevious]="true"` on `app-page-header`: its arrow goes back in history, and to `backLink` only when the app was opened on it. The lists and objectives bells count friend news only, so they open `/settings#friends`.

- Every launch opens on `SplashScreenComponent` (in `AppComponent`): 2 seconds or any tap, click or key, while the requested screen loads underneath. On wide windows it draws itself in the phone frame through the `--phone-*` variables in `styles.scss`, shared with `MobileShellLayoutComponent`: change the frame there, not in one of them.

- iOS Safari zooms in on any focused field under 16px and stays zoomed. `provideInputFocusZoomFix()` (`core/browser/input-focus-zoom.ts`) adds `maximum-scale=1` to the viewport on iOS only: iOS still allows pinch-zoom with it, Android would not and does not zoom on focus. Keep it when touching `index.html`'s viewport, or fields under 16px zoom again.

- What can be deleted from a list swipes left (`SwipeToDelete`, `shared/ui`): touch, mouse, touchpad and the Delete key; the owner gets a confirmation, anyone else a toast saying why. On a card that is a link (`ObjectiveSwipeCardComponent`), stop the click ending a swipe in the capture phase, as `RouterLink` listens on the link itself, and prevent `dragstart`, or the link's native drag cancels a mouse swipe.

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
- E-mail goes through `MailService` (nodemailer) to `SMTP_HOST`, in production a Mailcow mailbox (`SMTP_*`, `MAIL_FROM` in the VPS `.env`, passed by `compose.prod.yaml`). An empty `SMTP_HOST` sends nothing; outside production the reset link is logged instead, never in production (`NODE_ENV=production` in the image).
- Rate limiting (`@nestjs/throttler`, global guard, stricter `@Throttle` on login/register) keys on `req.ip`. That only works because `configureApp()` trusts private proxy hops and `deploy/Caddyfile` sets `trusted_proxies`; keep both, or every user shares one bucket. The store is in memory, which is fine only while the API runs as a single instance.

## Testing expectations

- Unit tests should exercise controllers/services without opening a network port.
- End-to-end tests should create the real `AppModule`, call `configureApp(app)`, and exercise versioned HTTP routes through Supertest. `createTestApp(overrides)` replaces providers that reach outside, e.g. `MailService` to capture e-mails.
- Do not run `npm run backend:build` while `npm run start:back` is running: both write `Backend/dist` and the watcher crashes on half-written files.
- Do not duplicate global prefix, validation, or CORS configuration inside tests.
- Every test needs at least one real `expect(...)`: SonarQube does not count Supertest's `.expect(404)` or `HttpTestingController`'s `expectOne()`, `expectNone()` and `verify()`, and flags the test as a blocker. Assert something that matters, such as the error body or that nothing changed, not a formality.
- Type-check the end-to-end project when changing its configuration:

```powershell
.\Backend\node_modules\.bin\tsc.cmd --project Backend\test\tsconfig.json
```

- On non-Windows systems, use the equivalent local TypeScript executable.
- Backend tests run with Vitest (`vitest.config.mts`, `vitest.config.e2e.mts`). Vitest compiles TypeScript with esbuild, which drops the decorator metadata Nest's dependency injection needs, so both configs compile through SWC (`unplugin-swc`). The e2e config spreads the unit one: `mergeConfig` would concatenate the `include` arrays and run both suites.
- Under Vitest the code runs as ES modules: `vi.spyOn` cannot replace a named import such as `scrypt` from `node:crypto`. Use `vi.mock()` with `importOriginal` instead (see `password.service.spec.ts`).
- Frontend unit tests run with Vitest in browser mode (headless Chromium through Playwright, `@angular/build:unit-test`), not jsdom: specs rely on `<dialog>.showModal()`, `navigator.clipboard` and real layout. Run `npm run test:browser-install` (in `Frontend/`) once per machine. Zone's `fakeAsync`/`tick` do not work under Vitest; use `vi.useFakeTimers()` and `vi.advanceTimersByTime()`.
- Global styles scoped under a component tag (e.g. `app-list-detail .entry-name-editor`) do not match in specs: the TestBed root is not that tag. Wrap the rendered element in a temporary element of that tag to test them.
- Do not call `setPointerCapture()` on `pointerdown` of something that is also tapped: the browser then retargets the click to the capturing element, so a tap on a button inside it is lost. Capture once the press becomes a drag or swipe (`SwipeToDelete`). Specs calling `.click()` on the button do not catch this; dispatch the pointer events too.
- For code that depends on today, in specs running real queries: `vi.useFakeTimers({ toFake: ['Date'] })` freezes the date and leaves the timers the database driver needs.
- A request from a lazy-loaded screen comes a few macrotasks after navigating: wait with `vi.waitFor()` and `http.match()`, as a fixed number of ticks is flaky on a cold start.
- `toObservable()` emits from an effect, which runs on change detection: call `fixture.detectChanges()` after changing the signal before waiting on a debounce.
- ES module exports cannot be spied on in frontend specs either: inject the dependency (e.g. `AVATAR_RESIZER`) so specs can provide a fake.
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
