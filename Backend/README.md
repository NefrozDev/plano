# Plano Backend

NestJS 11 REST API for Plano.

## Development

From the repository root:

```bash
npm run start:back
```

The API listens on `http://localhost:3000` by default. Verify it at `GET http://localhost:3000/api/v1/health`.

Copy `.env.example` to `.env` when you need local configuration. Never commit `.env`.

## Commands

```bash
npm run backend:build
npm run backend:lint
npm run backend:test
npm run backend:test:e2e
```

## Source structure

```text
src/
├── auth/            # Registration, login, session restoration, and logout
├── database/        # TypeORM and persistent sql.js/SQLite configuration
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
  token. Only its SHA-256 digest is stored in SQLite.
- Express sends the raw token only as a persistent `HttpOnly`, `SameSite=Lax`
  cookie. It is marked `Secure` when `NODE_ENV=production`.
- `GET /api/v1/auth/session` restores the safe public user profile, while
  `POST /api/v1/auth/logout` revokes that session and clears the cookie.
- Registration writes the user and first session in one database transaction, so
  a partial account cannot be left behind.

The pure-JavaScript sql.js driver and an automatically applied TypeORM migration
keep this learning project easy to run without native database tooling. Writes
are serialized because sql.js uses one in-process connection. Before a production
or multi-instance deployment, use a managed database such as PostgreSQL and add
distributed login rate limiting. Unsafe browser requests are origin-checked; add
a token-based CSRF strategy as well if the frontend and API are deployed cross-site.
