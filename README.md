# Plano

Plano is a full-stack learning and showcase application organized as a single repository.

## Repository structure

```text
plano/
├── Backend/   # NestJS REST API and persistent authentication
├── Common/    # Shared contracts and framework-independent types
└── Frontend/  # Angular application
```

The three boundaries are intentionally separate. `Frontend` and `Backend` may depend on `Common`; `Common` must not depend on either application.

## Local development

Install both applications from the repository root:

```bash
npm --prefix Frontend ci
npm --prefix Backend ci
```

Then run the API and Angular development server in separate terminals:

```bash
npm run start:back
npm run start:front
```

Other root commands:

```bash
npm run frontend:build
npm run frontend:test
npm run test:coverage
```

The application is available at `http://localhost:4200/`. Angular proxies
`/api` requests to the API at `http://localhost:3000/` during development.

## Authentication

Registration and login use an opaque, persistent session cookie. The cookie is
`HttpOnly`, so Angular cannot read or store the credential. On every app launch,
Angular calls `GET /api/v1/auth/session`; the backend hashes the cookie token and
looks up the matching session in its SQLite database. Users and sessions therefore
survive both browser and backend restarts. Logout revokes the stored session and
clears the cookie.

Local database files are created in `Backend/data/` and are intentionally ignored
by Git. Backend configuration names and safe defaults are documented in
`Backend/.env.example`.

## Test coverage

Run `npm run test:coverage` to generate both reports. Jest and Karma enforce a
minimum of 80% for statements, branches, functions, and lines; the command fails
when either application falls below any threshold. Generated reports are written
to each package's ignored `coverage/` directory.
