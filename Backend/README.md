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
├── health/          # First self-contained feature module
├── app.config.ts    # Shared HTTP configuration used by runtime and tests
├── app.module.ts    # Root module; composes application features
└── main.ts          # Application bootstrap
```

Add business capabilities as feature modules beside `health`. Controllers handle HTTP input/output, services contain application logic, and modules wire their dependencies together.
