# Plano Backend

NestJS 11 REST API for Plano.

## Development

From the repository root, with Docker running:

```bash
npm run db:start                 # PostgreSQL from compose.yaml
cp Backend/.env.example Backend/.env
npm run start:back
```

The API listens on `http://localhost:3000` by default. Verify it at `GET http://localhost:3000/api/v1/health`.

`DATABASE_URL` is required; the other settings in `.env.example` have defaults. Never commit `.env`.

## Tests and PostgreSQL

The services and end-to-end tests run against a real PostgreSQL. Jest's global
setup starts a throwaway `postgres:18-alpine` container with Testcontainers, so
Docker must be running; each test bed then creates and drops its own database.
Set `TEST_DATABASE_URL` to an existing server (connecting to its `postgres`
database) to skip the container, as a CI service would.

`src/database/migrations.spec.ts` checks that the migrations build exactly the
schema the entities describe, and that they can be reverted.

## Commands

```bash
npm run backend:build
npm run backend:lint
npm run backend:test
npm run backend:test:cov
npm run backend:test:e2e
```

The coverage command enforces at least 80% statements, branches, functions, and
lines across application logic. Declarative Nest modules, ORM entities, DTO
metadata, migrations, and the bootstrap entry point are verified by build and
end-to-end tests rather than counted as unit-test coverage.

## Source structure

```text
src/
├── auth/            # Registration, login, session restoration, and logout
├── database/        # TypeORM and PostgreSQL configuration, migrations
├── groups/          # Groups: create, join with an invite code, manage members
├── lists/           # Lists, sections and entries, shareable within a group
├── users/           # User persistence model
├── health/          # Self-contained health feature module
├── app.config.ts    # Shared HTTP configuration used by runtime and tests
├── app.module.ts    # Root module; composes application features
└── main.ts          # Application bootstrap
```

Controllers handle HTTP input/output, services contain application logic, and
modules wire their dependencies together.

## Authentication design

- Passwords are hashed asynchronously with salted, parameterized `scrypt` hashes.
- A successful registration or login creates a cryptographically random session
  token. Only its SHA-256 digest is stored in the database.
- Express sends the raw token only as a persistent `HttpOnly`, `SameSite=Lax`
  cookie. It is marked `Secure` when `NODE_ENV=production`.
- `GET /api/v1/auth/session` restores the safe public user profile, while
  `POST /api/v1/auth/logout` revokes that session and clears the cookie.
- Registration writes the user and first session in one database transaction, so
  a partial account cannot be left behind.

## Lists API

Request and response shapes are the TypeScript interfaces of `Common/src/lists.ts`;
the validated DTOs implement them. Every route requires a session.

| Method and path | Who | Result |
| --- | --- | --- |
| `GET /lists` | any user | Lists you own or that are shared with you |
| `POST /lists` | any user | Creates a list you own |
| `GET /lists/reminders` | any user | Entries with a reminder, for the agenda |
| `GET /lists/:listId` | members | The list with its members, sections and entries |
| `PATCH /lists/:listId`, `DELETE /lists/:listId` | owner | Edits or deletes the list |
| `POST /lists/:listId/sections` | owner, editors | Adds a section |
| `POST /lists/:listId/sections/:sectionId/entries` | owner, editors | Adds an entry |
| `PUT /lists/:listId/sections/:sectionId/order` | owner, editors | Reorders a section (every entry id, once) |
| `PATCH`/`DELETE /lists/:listId/entries/:entryId` | owner, editors | Edits or deletes an entry |
| `POST /lists/:listId/members`, `DELETE /lists/:listId/members` | owner | Shares with a group member; stops sharing |
| `PATCH /lists/:listId/members/:userId` | owner | Changes a member's role (`editor` or `viewer`) |
| `DELETE /lists/:listId/members/:userId` | owner, or that member | Removes a member, or leaves the list |
| `GET`/`PATCH /settings/lists` | any user | Your list display preferences |

- A list can only be shared with members of the owner's group, and access ends
  as soon as either of them leaves it.
- Lists you cannot see answer `404`, like lists that do not exist, so list ids
  cannot be probed. Seeing a list but lacking the role for a change answers `403`.

TypeORM migrations run automatically at startup, all in one transaction: a
failing migration leaves the schema untouched. Writes are still serialized within
one API process; before running several instances, replace that with row locks
and add distributed login rate limiting. Unsafe browser requests are origin-checked; add
a token-based CSRF strategy as well if the frontend and API are deployed cross-site.
