# Plano Frontend

Angular 17 single-page application.

The frontend is intentionally client-rendered because authentication is restored
from a persistent `HttpOnly` cookie. Rendering protected routes ahead of a real
browser request would not have access to that cookie and could cache or display
the wrong authentication state.

## Commands

Run these commands from this directory:

```bash
npm install
npm start
npm run build
npm test
npm run test:cov
```

`test:cov` runs Chrome headlessly and enforces at least 80% statements, branches,
functions, and lines.

The development server is available at `http://localhost:4200/`.

Requests under `/api` are proxied to `http://localhost:3000` during local
development. The production host should route `/api/v1` to the NestJS backend on
the same site. The frontend never stores an authentication token in browser
storage; it restores the current user through `GET /api/v1/auth/session` and
sends credentials with each API request.
